// Pure helpers for the narration scripts: validation of every file and response the kit
// reads, word timing, captions-only timing, the line cache key and SRT output.
import { createHash } from 'node:crypto';
import { FPS, chunks, place, stamp, type Line, type Word } from '../src/captions.ts';
import { KitError } from '../src/errors.ts';

/** A script in `src/narration/<id>.json`: one paragraph of narration per scene. */
export type Script = { voice?: string; model?: string; lines: string[] };

/**
 * One entry of `public/narration/<id>/timing.json`. A voiced line's audio is `<hash>.mp3`;
 * captions-only entries have no audio file and no hash.
 */
export type Timed = Line & { hash?: string; captionsOnly?: true };

/**
 * What the cache keeps for one voiced line, in `public/narration/<id>/<hash>.json` next to
 * `<hash>.mp3`, so the line is reused wherever it moves in the script.
 */
export type Sidecar = { text: string; seconds: number; words: Word[] };

/** ElevenLabs model used when a script sets none. */
export const DEFAULT_MODEL = 'eleven_v4';
/** Words per second for captions-only timing: a typical narrator's pace. */
export const PACE = 2.8;
/** The longest line ElevenLabs accepts in one request for eleven_v4, in characters. */
export const MAX_LINE = 10_000;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Checks a parsed narration script and returns it typed.
 * @throws KitError naming the file and the field that is wrong.
 */
export function parseScript(raw: unknown, file: string): Script {
  const fix = 'See src/narration/explainer.json for the expected shape.';
  if (!isObject(raw)) throw new KitError(`${file} is not a JSON object.`, fix);
  const { voice, model, lines } = raw;
  if (voice !== undefined && (typeof voice !== 'string' || !/^[A-Za-z0-9]{8,64}$/.test(voice))) {
    throw new KitError(`${file} has a "voice" that is not an ElevenLabs voice ID.`, 'List the IDs your key can use with `npm run narrate -- voices`.');
  }
  if (model !== undefined && (typeof model !== 'string' || !/^[a-z0-9_.]+$/.test(model))) throw new KitError(`${file} has an invalid "model".`, `Leave it out to use ${DEFAULT_MODEL}.`);
  if (!Array.isArray(lines) || lines.length === 0) throw new KitError(`${file} needs "lines": one string per scene.`, fix);
  lines.forEach((line, i) => {
    if (typeof line !== 'string' || !line.trim()) throw new KitError(`${file}: line ${i + 1} is empty or not a string.`, fix);
    if (line.length > MAX_LINE) throw new KitError(`${file}: line ${i + 1} is ${line.length} characters.`, `Split it; ElevenLabs takes up to ${MAX_LINE} per request.`);
  });
  return { voice, model, lines } as Script;
}

const isWord = (w: unknown): w is Word => isObject(w) && typeof w.w === 'string' && typeof w.start === 'number' && typeof w.end === 'number';

/**
 * Checks a parsed `timing.json` and returns it typed.
 * @throws KitError if any entry is malformed, with the command that rebuilds the file.
 */
export function parseTiming(raw: unknown, file: string, id: string): Timed[] {
  const rebuild = `Rebuild it with \`npm run narrate -- ${id} --captions-only\`, or without the flag to voice it.`;
  if (!Array.isArray(raw) || raw.length === 0) throw new KitError(`${file} has no lines.`, rebuild);
  raw.forEach((t: unknown, i) => {
    const ok =
      isObject(t) &&
      typeof t.text === 'string' &&
      typeof t.seconds === 'number' &&
      t.seconds > 0 &&
      Array.isArray(t.words) &&
      t.words.every(isWord) &&
      (t.file === undefined || (typeof t.file === 'string' && /^[a-f0-9]{16}\.mp3$/.test(t.file)));
    if (!ok) throw new KitError(`${file}: entry ${i + 1} is malformed.`, rebuild);
  });
  return raw as Timed[];
}

/** Checks a cached line's sidecar; returns null when it is missing parts, so the line is voiced again. */
export function parseSidecar(raw: unknown): Sidecar | null {
  return isObject(raw) && typeof raw.text === 'string' && typeof raw.seconds === 'number' && raw.seconds > 0 && Array.isArray(raw.words) && raw.words.every(isWord)
    ? (raw as Sidecar)
    : null;
}

/** Character timings from ElevenLabs' with-timestamps endpoint. */
export type Alignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

/** Checks the body of a with-timestamps response and returns the audio and its alignment. */
export function parseSpeech(raw: unknown, line: number): { audio: Buffer; alignment: Alignment } {
  const retry = 'Run the same command again; finished lines are kept.';
  if (!isObject(raw) || typeof raw.audio_base64 !== 'string' || !raw.audio_base64) throw new KitError(`ElevenLabs returned no audio for line ${line}.`, retry);
  const a = raw.alignment ?? raw.normalized_alignment;
  const ok =
    isObject(a) &&
    Array.isArray(a.characters) &&
    Array.isArray(a.character_start_times_seconds) &&
    Array.isArray(a.character_end_times_seconds) &&
    a.characters.length > 0 &&
    a.characters.length === a.character_start_times_seconds.length &&
    a.characters.length === a.character_end_times_seconds.length;
  if (!ok) {
    throw new KitError(`ElevenLabs returned no word timings for line ${line}.`, `The model may not support timestamps; set "model" to another model, for example "eleven_multilingual_v2".`);
  }
  return { audio: Buffer.from(raw.audio_base64, 'base64'), alignment: a as Alignment };
}

/** Groups character timings into words, skipping whitespace. */
export function wordsFromAlignment(a: Alignment): Word[] {
  const words: Word[] = [];
  let current: Word | null = null;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      current = null;
      return;
    }
    if (!current) words.push((current = { w: '', start: a.character_start_times_seconds[i], end: 0 }));
    current.w += ch;
    current.end = a.character_end_times_seconds[i];
  });
  return words;
}

/**
 * Timing without a voice: words spread evenly at `pace` words a second, so scenes can be
 * laid out, captioned and reviewed before any text-to-speech credit is spent.
 */
export function captionsOnly(text: string, pace = PACE): Timed {
  const tokens = text.trim().split(/\s+/);
  const seconds = Math.round((tokens.length / pace) * 100) / 100;
  const step = seconds / tokens.length;
  const words = tokens.map((w, i) => ({
    w,
    start: Math.round(i * step * 1000) / 1000,
    end: Math.round((i + 0.9) * step * 1000) / 1000,
  }));
  return { captionsOnly: true, text, seconds, words };
}

/**
 * The cache key of a voiced line: it changes when the model, the voice or the text does.
 * The neighbouring lines sent as context are left out on purpose, so editing one line does
 * not re-voice the lines around it.
 */
export const lineHash = (model: string, voice: string, text: string): string =>
  createHash('sha256').update(`${model}|${voice}|${text}`).digest('hex').slice(0, 16);

/**
 * SRT cues chunked the same way as the burned-in captions. Each cue stays up until the
 * next one in its scene starts, as on screen; a scene's last cue ends with the scene.
 */
export function toSrt(lines: Line[]): string {
  const cues: string[] = [];
  for (const scene of place(lines)) {
    const offset = scene.from / FPS;
    const parts = chunks(scene.words);
    parts.forEach((part, k) => {
      const start = offset + part[0].start;
      const end = k + 1 < parts.length ? offset + parts[k + 1][0].start : (scene.from + scene.frames) / FPS;
      cues.push(`${cues.length + 1}\n${stamp(start)} --> ${stamp(end)}\n${part.map((w) => w.w).join(' ')}\n`);
    });
  }
  return cues.join('\n');
}
