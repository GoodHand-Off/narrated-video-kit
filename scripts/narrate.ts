// Turns a script in src/narration/<id>.json into public/narration/<id>/timing.json, which
// the video reads for its scene lengths, word cues and captions.
//   npm run narrate -- <id> --captions-only   no voice, no key: words at a steady pace
//   npm run narrate -- <id>                    voice every line with ElevenLabs
//   npm run narrate -- <id> --prune            ...and delete voiced lines the script no longer uses
//   npm run narrate -- voices                  list the voices your key can use
//   npm run narrate -- audition <voice_id>...  read one sentence in each voice
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { KitError } from '../src/errors.ts';
import { KEY_FILE, ROOT, checkEnvFiles, checkId, isEntry, misplacedKey, parseArgs, run } from './cli.ts';
import { seconds } from './ff.ts';
import { DEFAULT_MODEL, captionsOnly, lineHash, parseScript, parseSidecar, parseSpeech, wordsFromAlignment, type Script, type Timed } from './timing.ts';

const API = 'https://api.elevenlabs.io';
const KEY_PAGE = 'https://elevenlabs.io/app/settings/api-keys';
/** How long one text-to-speech request may take before it is abandoned, in milliseconds. */
export const SPEECH_TIMEOUT = 120_000;
/** How long one page of the voice list may take, in milliseconds. */
export const LIST_TIMEOUT = 30_000;
/** The most pages of voices to fetch; 100 voices a page. */
export const MAX_VOICE_PAGES = 20;
const USAGE = 'npm run narrate -- <id> [--captions-only | --prune] | voices | audition <voice_id>...';

/**
 * Reads `ELEVENLABS_API_KEY` from the shell, or from `.env.elevenlabs` in `root`, and from
 * nowhere else. Remotion never reads `.env.elevenlabs` (see remotion.config.ts).
 * @throws KitError naming the variable, the file and where to create a key.
 */
export function apiKey(root = ROOT): string {
  checkEnvFiles(root);
  if (!process.env.ELEVENLABS_API_KEY && existsSync(join(root, KEY_FILE))) process.loadEnvFile(join(root, KEY_FILE));
  const key = process.env.ELEVENLABS_API_KEY?.trim() ?? '';
  const misplaced = key ? undefined : misplacedKey(root);
  if (misplaced) {
    throw new KitError(`ELEVENLABS_API_KEY is in ${misplaced}, but the kit reads the key only from ${KEY_FILE} or the shell.`, `Move the line to ${KEY_FILE}, then run the command again.`);
  }
  if (!key) {
    throw new KitError(
      'ELEVENLABS_API_KEY is not set.',
      `Create a key at ${KEY_PAGE} and put ELEVENLABS_API_KEY=<key> in ${KEY_FILE}, or add --captions-only to work without a voice.`,
    );
  }
  if (/\s|["']/.test(key)) throw new KitError('ELEVENLABS_API_KEY contains spaces or quotes.', 'Paste the key exactly as ElevenLabs shows it, with nothing around it.');
  return key;
}

/**
 * Reads an ElevenLabs error body (`{"detail": {"type", "message", ...}}` or a plain string)
 * into a short message, with the key cut out, and whether it is an authentication error.
 */
export function describe(body: string, key: string): { message: string; auth: boolean } {
  const text = key ? body.split(key).join('[key]') : body;
  try {
    const detail: unknown = JSON.parse(text).detail;
    if (typeof detail === 'string') return { message: detail.slice(0, 300), auth: false };
    if (typeof detail === 'object' && detail !== null) {
      const d = detail as { type?: unknown; message?: unknown };
      return { message: typeof d.message === 'string' ? d.message.slice(0, 300) : text.slice(0, 300), auth: d.type === 'authentication_error' };
    }
  } catch {
    // Not JSON: show the start of the body as it is.
  }
  return { message: text.slice(0, 300) || '(empty response)', auth: false };
}

// One ElevenLabs request with a timeout. The key goes only in the xi-api-key header and is
// cut out of anything the provider sends back before it is shown.
async function call(path: string, timeout: number, root: string, body?: unknown): Promise<unknown> {
  const key = apiKey(root);
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new KitError(`ElevenLabs did not answer within ${timeout / 1000} seconds.`, 'Run the same command again; finished lines are kept.');
    }
    throw new KitError(`Could not reach ElevenLabs (${error instanceof Error ? error.message : String(error)}).`, 'Check your connection, or add --captions-only to work without a voice.');
  }
  if (!response.ok) {
    const { message, auth } = describe(await response.text(), key);
    if (auth || response.status === 401) {
      throw new KitError(`ElevenLabs rejected ELEVENLABS_API_KEY: ${message}`, `Check the key in ${KEY_FILE}, or create a new one at ${KEY_PAGE}.`);
    }
    const hint =
      response.status === 429
        ? 'You hit an ElevenLabs rate or quota limit. Wait, then run the same command again; finished lines are kept.'
        : 'Check the "voice" and "model" in the script, then run the same command again; finished lines are kept.';
    throw new KitError(`ElevenLabs answered ${response.status}: ${message}`, hint);
  }
  try {
    return await response.json();
  } catch {
    throw new KitError('ElevenLabs sent a response that is not JSON.', 'Run the same command again; finished lines are kept.');
  }
}

/** Reads and validates `src/narration/<id>.json`, and prepares `public/narration/<id>`. */
export function load(id: string, root = ROOT): { script: Script; dir: string; timingFile: string } {
  const rel = `src/narration/${id}.json`;
  const file = join(root, rel);
  if (!existsSync(file)) throw new KitError(`There is no script at ${rel}.`, 'Copy src/narration/template.json to start one.');
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new KitError(`${rel} is not valid JSON (${error instanceof Error ? error.message : String(error)}).`, 'Fix the syntax; an editor with JSON checking will point at the line.');
  }
  const script = parseScript(raw, rel);
  const dir = join(root, 'public/narration', id);
  mkdirSync(dir, { recursive: true });
  return { script, dir, timingFile: join(dir, 'timing.json') };
}

function save(timingFile: string, timing: Timed[]) {
  writeFileSync(timingFile, JSON.stringify(timing, null, 2) + '\n');
}

const total = (timing: Timed[]) => timing.reduce((sum, t) => sum + t.seconds, 0).toFixed(1);

/** Writes captions-only timing for every line of the script: no key, no network. */
export function captions(id: string, root = ROOT): Timed[] {
  const { script, timingFile } = load(id, root);
  const timing = script.lines.map((text) => captionsOnly(text));
  save(timingFile, timing);
  console.log(`${id}: ${timing.length} lines, ${total(timing)} seconds, captions only (silent). Next: npm run make -- ${id}`);
  return timing;
}

async function speak(voice: string, model: string, text: string, line: number, root: string, context: { previous_text?: string; next_text?: string } = {}) {
  const raw = await call(`/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, SPEECH_TIMEOUT, root, { text, model_id: model, ...context });
  const { audio, alignment } = parseSpeech(raw, line);
  return { audio, words: wordsFromAlignment(alignment) };
}

// A line already voiced with the same model, voice and text: its audio and sidecar, if both
// are there and readable.
function cached(dir: string, hash: string) {
  const sidecar = join(dir, `${hash}.json`);
  if (!existsSync(join(dir, `${hash}.mp3`)) || !existsSync(sidecar)) return null;
  try {
    return parseSidecar(JSON.parse(readFileSync(sidecar, 'utf8')));
  } catch {
    return null;
  }
}

/**
 * Voices the script with ElevenLabs. Each line's audio is `<hash>.mp3` with its word timing
 * in `<hash>.json`, written as soon as the line is voiced, so a line is reused wherever it
 * moves in the script and a failed run never pays twice for it. `timing.json` is written
 * once every line is ready, so it always matches the audio it names. Old lines stay cached
 * (an undo costs nothing) unless `prune` is set.
 */
export async function narrate(id: string, root = ROOT, prune = false): Promise<Timed[]> {
  const { script, dir, timingFile } = load(id, root);
  if (!script.voice) {
    throw new KitError(`src/narration/${id}.json has no "voice".`, 'List the voices your key can use with `npm run narrate -- voices`, then add one as "voice".');
  }
  apiKey(root);
  const model = script.model ?? DEFAULT_MODEL;
  const timing: Timed[] = [];
  let voiced = 0;
  for (const [i, text] of script.lines.entries()) {
    const hash = lineHash(model, script.voice, text);
    let line = cached(dir, hash);
    if (!line) {
      const spoken = await speak(script.voice, model, text, i + 1, root, { previous_text: script.lines[i - 1], next_text: script.lines[i + 1] });
      writeFileSync(join(dir, `${hash}.mp3`), spoken.audio);
      line = { text, seconds: seconds(join(dir, `${hash}.mp3`), root), words: spoken.words };
      writeFileSync(join(dir, `${hash}.json`), JSON.stringify(line) + '\n');
      voiced++;
    }
    timing.push({ file: `${hash}.mp3`, hash, text, seconds: line.seconds, words: line.words });
  }
  save(timingFile, timing);
  const removed = prune ? pruneUnused(dir, timing) : 0;
  console.log(
    `${id}: ${timing.length} lines, ${total(timing)} seconds, ${voiced} voiced with ${model}, ${timing.length - voiced} reused` +
      (prune ? `, ${removed} unused voiced line(s) deleted.` : '.'),
  );
  return timing;
}

// Deletes <hash>.mp3 and <hash>.json files that the new timing does not use.
function pruneUnused(dir: string, timing: Timed[]): number {
  const keep = new Set(timing.map((t) => t.hash));
  const unused = new Set(
    readdirSync(dir)
      .map((f) => /^([0-9a-f]{16})\.(mp3|json)$/.exec(f)?.[1])
      .filter((h): h is string => !!h && !keep.has(h)),
  );
  for (const hash of unused) for (const ext of ['mp3', 'json']) rmSync(join(dir, `${hash}.${ext}`), { force: true });
  return unused.size;
}

/** A voice your key can use. */
export type Voice = { voice_id: string; name: string; category?: string };

/** Lists every voice your ElevenLabs key can use, following the pages of the list. */
export async function voices(root = ROOT): Promise<Voice[]> {
  const all: Voice[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_VOICE_PAGES; page++) {
    const raw = await call(`/v2/voices?page_size=100${cursor ? `&next_page_token=${encodeURIComponent(cursor)}` : ''}`, LIST_TIMEOUT, root);
    if (!(typeof raw === 'object' && raw !== null && Array.isArray((raw as { voices?: unknown }).voices))) {
      throw new KitError('ElevenLabs sent a voice list in an unexpected shape.', 'Run the same command again.');
    }
    const body = raw as { voices: Voice[]; has_more?: boolean; next_page_token?: string };
    all.push(...body.voices.filter((v) => typeof v.voice_id === 'string' && typeof v.name === 'string'));
    if (!body.has_more || !body.next_page_token) break;
    cursor = body.next_page_token;
  }
  return all;
}

/** The sentence `audition` reads in each voice. */
export const AUDITION_LINE = 'Every scene in this video starts on a word I say, and every caption is cut from my timing.';

/** Reads {@link AUDITION_LINE} in each voice into `out/auditions/<voice_id>.mp3`. */
export async function audition(ids: string[], root = ROOT): Promise<string[]> {
  if (ids.length === 0) throw new KitError('audition needs at least one voice ID.', 'Get IDs with `npm run narrate -- voices`.');
  const dir = join(root, 'out/auditions');
  mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  for (const [i, id] of ids.entries()) {
    if (!/^[A-Za-z0-9]{8,64}$/.test(id)) throw new KitError(`"${id}" is not an ElevenLabs voice ID.`, 'Get IDs with `npm run narrate -- voices`.');
    const file = join(dir, `${id}.mp3`);
    writeFileSync(file, (await speak(id, DEFAULT_MODEL, AUDITION_LINE, i + 1, root)).audio);
    files.push(file);
  }
  return files;
}

/** The command line: see the usage at the top of this file. Arguments may come in any order. */
export async function main(argv: string[], root = ROOT): Promise<void> {
  const { positional, options } = parseArgs(argv, USAGE, ['--captions-only', '--prune']);
  const [command, ...rest] = positional;
  if (command === 'voices' || command === 'audition') {
    if (options.size) throw new KitError(`${[...options.keys()].join(' ')} does not apply to ${command}.`, `Usage: ${USAGE}`);
    if (command === 'voices') {
      if (rest.length) throw new KitError(`voices takes no arguments, not ${rest.join(' ')}.`, `Usage: ${USAGE}`);
      for (const v of await voices(root)) console.log(`${v.voice_id}  ${v.name}${v.category ? `  (${v.category})` : ''}`);
    } else {
      for (const file of await audition(rest, root)) console.log(file);
    }
    return;
  }
  const id = checkId(command, USAGE);
  if (rest.length) throw new KitError(`Unexpected ${rest.join(' ')}.`, `Usage: ${USAGE}`);
  if (options.has('--captions-only') && options.has('--prune')) throw new KitError('--prune only applies when voicing.', `Usage: ${USAGE}`);
  if (options.has('--captions-only')) captions(id, root);
  else await narrate(id, root, options.has('--prune'));
}

if (isEntry(import.meta.url)) await run(() => main(process.argv.slice(2)));
