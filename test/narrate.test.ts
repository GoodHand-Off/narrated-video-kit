import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { KitError } from '../src/errors.ts';
import { AUDITION_LINE, apiKey, audition, captions, describe as describeError, load, main, narrate, voices } from '../scripts/narrate.ts';
import { lineHash } from '../scripts/timing.ts';
import { alignmentFor, media, tempRoot, writeScript, writeTiming } from './helpers.ts';

const KEY = 'sk_test_key_that_is_not_real_000000000000000000000';
const VOICE = 'JBFqnCBsd6RMkjVDRZzb';
let fixture: ReturnType<typeof tempRoot>;
let root: string;
let mp3: string; // a real one-second MP3, so ffprobe can read the line lengths

beforeAll(() => {
  fixture = tempRoot();
  root = fixture.root;
  mp3 = readFileSync(media(root, 'sine', 'tone.mp3')).toString('base64');
});
afterAll(() => fixture.cleanup());

beforeEach(() => {
  vi.stubEnv('ELEVENLABS_API_KEY', KEY);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  writeScript(root, 'demo', { title: 'Demo', voice: VOICE, lines: ['One two.', 'Three four.'] });
  rmSync(join(root, 'public/narration/demo'), { recursive: true, force: true });
  for (const f of ['.env', '.env.local', '.env.elevenlabs']) rmSync(join(root, f), { force: true });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const speech = (text: string) => new Response(JSON.stringify({ audio_base64: mp3, alignment: alignmentFor(text) }), { status: 200 });

function stubSpeech() {
  const fetch = vi.fn(async (_url: string, init: RequestInit) => speech(JSON.parse(String(init.body)).text));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const spoken = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)).text);
const timing = (id = 'demo') => JSON.parse(readFileSync(join(root, 'public/narration', id, 'timing.json'), 'utf8'));
const setLines = (lines: string[]) => writeScript(root, 'demo', { title: 'Demo', voice: VOICE, lines });

describe('apiKey', () => {
  it('reads the shell environment first', () => {
    expect(apiKey(root)).toBe(KEY);
  });

  it('falls back to .env.elevenlabs', () => {
    vi.stubEnv('ELEVENLABS_API_KEY', '');
    delete process.env.ELEVENLABS_API_KEY;
    writeFileSync(join(root, '.env.elevenlabs'), 'ELEVENLABS_API_KEY=sk_from_file\n');
    expect(apiKey(root)).toBe('sk_from_file');
  });

  it('refuses to run while a secret-like REMOTION_* variable would be published', () => {
    vi.stubEnv('REMOTION_API_TOKEN', 'x');
    expect(() => apiKey(root)).toThrow(/REMOTION_API_TOKEN would be copied into the Studio page[\s\S]*rename it without the REMOTION_ prefix/);
  });

  it.each([
    ['.env', 'ELEVENLABS_API_KEY=sk_misplaced'],
    ['.env.local', 'ELEVENLABS_API_KEY: sk_misplaced'],
  ])('points a key saved in %s to .env.elevenlabs', (file, line) => {
    vi.stubEnv('ELEVENLABS_API_KEY', '');
    writeFileSync(join(root, file), `${line}\n`);
    expect(() => apiKey(root)).toThrow(new RegExp(`ELEVENLABS_API_KEY is in \\${file}, but the kit reads the key only from \\.env\\.elevenlabs or the shell`));
  });

  it('names the variable, the file and where to create a key when it is missing', () => {
    vi.stubEnv('ELEVENLABS_API_KEY', '');
    expect(() => apiKey(root)).toThrow(/ELEVENLABS_API_KEY is not set[\s\S]*elevenlabs\.io\/app\/settings\/api-keys[\s\S]*\.env\.elevenlabs[\s\S]*--captions-only/);
  });

  it('rejects a key pasted with quotes or spaces', () => {
    vi.stubEnv('ELEVENLABS_API_KEY', '"sk abc"');
    expect(() => apiKey(root)).toThrow(/spaces or quotes/);
  });
});

describe('load', () => {
  it('explains a missing script, bad JSON and a bad shape', () => {
    expect(() => load('nope', root)).toThrow(/There is no script at src\/narration\/nope\.json[\s\S]*template\.json/);
    writeScript(root, 'broken', '{ "title": ');
    expect(() => load('broken', root)).toThrow(/is not valid JSON/);
    writeScript(root, 'shapeless', { title: 'x' });
    expect(() => load('shapeless', root)).toThrow(/needs "lines"/);
  });
});

describe('captions-only', () => {
  it('writes silent timing with no key and no network', () => {
    vi.stubEnv('ELEVENLABS_API_KEY', '');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const t = captions('demo', root);
    expect(t).toHaveLength(2);
    expect(timing()).toEqual(t);
    expect(t.every((line) => line.file === undefined)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('narrate', () => {
  it('voices every line into <hash>.mp3 with a sidecar, and writes the timing', async () => {
    const fetch = stubSpeech();
    const t = await narrate('demo', root);
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/with-timestamps?output_format=mp3_44100_128`);
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe(KEY);
    expect(JSON.parse(String(init.body))).toEqual({ text: 'One two.', model_id: 'eleven_v4', next_text: 'Three four.' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const hash = lineHash('eleven_v4', VOICE, 'One two.');
    expect(t[0]).toMatchObject({ file: `${hash}.mp3`, hash, text: 'One two.' });
    expect(t[0].seconds).toBeGreaterThan(0.9);
    expect(t[0].words.map((w) => w.w)).toEqual(['One', 'two.']);
    const sidecar = JSON.parse(readFileSync(join(root, 'public/narration/demo', `${hash}.json`), 'utf8'));
    expect(sidecar).toEqual({ text: 'One two.', seconds: t[0].seconds, words: t[0].words });
    expect(timing()).toEqual(t);
  });

  it('reuses lines by content: unchanged, inserted above, reordered or after captions-only', async () => {
    stubSpeech();
    await narrate('demo', root);
    let fetch = stubSpeech();
    await narrate('demo', root);
    expect(fetch).not.toHaveBeenCalled();
    setLines(['Zero.', 'One two.', 'Three four.']);
    await narrate('demo', root);
    expect(spoken(fetch)).toEqual(['Zero.']);
    fetch = stubSpeech();
    setLines(['Three four.', 'Zero.', 'One two.']);
    await narrate('demo', root);
    expect(fetch).not.toHaveBeenCalled();
    expect(timing().map((t: { text: string }) => t.text)).toEqual(['Three four.', 'Zero.', 'One two.']);
    captions('demo', root);
    await narrate('demo', root);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('deletes voiced lines the script no longer uses only with --prune', async () => {
    stubSpeech();
    await narrate('demo', root);
    setLines(['One two.']);
    await narrate('demo', root);
    const dir = join(root, 'public/narration/demo');
    const voicedFiles = () => readdirSync(dir).filter((f) => /^[0-9a-f]{16}\.(mp3|json)$/.test(f)).length;
    expect(voicedFiles()).toBe(4);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await narrate('demo', root, true);
    expect(voicedFiles()).toBe(2);
    expect(log.mock.calls.at(-1)?.[0]).toMatch(/1 unused voiced line\(s\) deleted/);
  });

  it('voices only the edited line', async () => {
    stubSpeech();
    await narrate('demo', root);
    const fetch = stubSpeech();
    setLines(['One two.', 'Three five.']);
    await narrate('demo', root);
    expect(spoken(fetch)).toEqual(['Three five.']);
  });

  it('keeps finished lines and the old timing when a later line fails', async () => {
    writeTiming(root, 'demo', [{ text: 'old', seconds: 1, words: [] }]);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(speech('One two.'))
      .mockResolvedValueOnce(new Response('{"detail":{"type":"server_error","message":"Busy"}}', { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    await expect(narrate('demo', root)).rejects.toThrow(/ElevenLabs answered 503: Busy[\s\S]*finished lines are kept/);
    expect(timing()).toEqual([{ text: 'old', seconds: 1, words: [] }]);
    const retry = stubSpeech();
    await narrate('demo', root);
    expect(spoken(retry)).toEqual(['Three four.']);
    expect(timing().map((t: { text: string }) => t.text)).toEqual(['One two.', 'Three four.']);
  });

  it('voices a line again when its cache is broken', async () => {
    stubSpeech();
    await narrate('demo', root);
    const dir = join(root, 'public/narration/demo');
    const sidecars = readdirSync(dir).filter((f) => /^[0-9a-f]{16}\.json$/.test(f));
    writeFileSync(join(dir, sidecars[0]), '{ broken');
    writeFileSync(join(dir, sidecars[1]), '{"text":"x"}');
    const fetch = stubSpeech();
    await narrate('demo', root);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(existsSync(join(dir, sidecars[0]))).toBe(true);
  });

  it('asks for a voice when the script has none', async () => {
    writeScript(root, 'demo', { title: 'Demo', lines: ['One.'] });
    await expect(narrate('demo', root)).rejects.toThrow(/has no "voice"[\s\S]*narrate -- voices/);
  });

  it('asks for a key before calling ElevenLabs', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', '');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(narrate('demo', root)).rejects.toThrow(/ELEVENLABS_API_KEY is not set/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [new Response('{"detail":{"type":"authentication_error","code":"invalid_api_key","message":"API key is invalid."}}', { status: 401 }), /rejected ELEVENLABS_API_KEY: API key is invalid\.[\s\S]*\.env\.elevenlabs[\s\S]*api-keys/],
    [new Response('{"detail":{"type":"authentication_error","message":"API key must be exactly 51 characters, got 52."}}', { status: 400 }), /rejected ELEVENLABS_API_KEY: API key must be exactly 51/],
    [new Response('{"detail":{"type":"rate_limit_error","message":"Too many"}}', { status: 429 }), /answered 429: Too many[\s\S]*rate or quota limit/],
    [new Response('upstream gone', { status: 502 }), /answered 502: upstream gone[\s\S]*Check the "voice" and "model"/],
    [new Response('not json', { status: 200 }), /not JSON/],
    [new Response('{"audio_base64":""}', { status: 200 }), /no audio for line 1/],
  ])('turns a provider answer into a clear error (%#)', async (response, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(narrate('demo', root)).rejects.toThrow(message);
  });

  it('reports a timeout and a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')));
    await expect(narrate('demo', root)).rejects.toThrow(/did not answer within 120 seconds/);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(narrate('demo', root)).rejects.toThrow(/Could not reach ElevenLabs \(fetch failed\)/);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('offline'));
    await expect(narrate('demo', root)).rejects.toThrow(/Could not reach ElevenLabs \(offline\)/);
  });

  it('never shows the key, even if the provider echoes it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(`bad key ${KEY}`, { status: 500 })));
    const error = await narrate('demo', root).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(KitError);
    expect(String((error as Error).message)).not.toContain(KEY);
    expect(String((error as Error).message)).toContain('[key]');
  });
});

describe('describe', () => {
  it('reads string details, objects without a message, plain text and empty bodies', () => {
    expect(describeError('{"detail":"Voice not found"}', KEY)).toEqual({ message: 'Voice not found', auth: false });
    expect(describeError('{"detail":{"type":"x"}}', KEY).message).toBe('{"detail":{"type":"x"}}');
    expect(describeError('{"other":1}', KEY).message).toBe('{"other":1}');
    expect(describeError('', '')).toEqual({ message: '(empty response)', auth: false });
  });
});

describe('voices and audition', () => {
  it('follows every page of the voice list and skips malformed entries', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ voices: [{ voice_id: VOICE, name: 'George', category: 'premade' }, { name: 'no id' }], has_more: true, next_page_token: 'p2' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ voices: [{ voice_id: 'abcdefgh12345678', name: 'Second' }], has_more: false })));
    vi.stubGlobal('fetch', fetch);
    expect(await voices(root)).toEqual([
      { voice_id: VOICE, name: 'George', category: 'premade' },
      { voice_id: 'abcdefgh12345678', name: 'Second' },
    ]);
    expect(fetch.mock.calls[1][0]).toBe('https://api.elevenlabs.io/v2/voices?page_size=100&next_page_token=p2');
  });

  it('rejects a voice list in an unexpected shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"items":[]}')));
    await expect(voices(root)).rejects.toThrow(/unexpected shape/);
  });

  it('reads the audition sentence in each voice', async () => {
    const fetch = stubSpeech();
    const files = await audition([VOICE], root);
    expect(files).toEqual([join(root, 'out/auditions', `${VOICE}.mp3`)]);
    expect(spoken(fetch)).toEqual([AUDITION_LINE]);
  });

  it('needs valid voice IDs', async () => {
    await expect(audition([], root)).rejects.toThrow(/at least one voice ID/);
    await expect(audition(['../etc'], root)).rejects.toThrow(/not an ElevenLabs voice ID/);
  });
});

describe('main', () => {
  it('runs captions-only, voicing, voices and audition', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await main(['demo', '--captions-only'], root);
    expect(log.mock.calls.at(-1)?.[0]).toMatch(/captions only \(silent\)\. Next: npm run make -- demo/);
    stubSpeech();
    await main(['demo'], root);
    expect(log.mock.calls.at(-1)?.[0]).toMatch(/2 voiced with eleven_v4, 0 reused/);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ voices: [{ voice_id: VOICE, name: 'George' }] }))));
    await main(['voices'], root);
    expect(log.mock.calls.at(-1)?.[0]).toBe(`${VOICE}  George`);
    stubSpeech();
    await main(['audition', VOICE], root);
    expect(log.mock.calls.at(-1)?.[0]).toContain(`${VOICE}.mp3`);
  });

  it('takes arguments in any order and passes --prune through', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await main(['--captions-only', 'demo'], root);
    expect(log.mock.calls.at(-1)?.[0]).toMatch(/captions only/);
    stubSpeech();
    await main(['--prune', 'demo'], root);
    expect(log.mock.calls.at(-1)?.[0]).toMatch(/0 unused voiced line\(s\) deleted/);
  });

  it('rejects flags that do not apply, without calling ElevenLabs', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(main(['voices', '--captions-only'], root)).rejects.toThrow(/--captions-only does not apply to voices/);
    await expect(main(['voices', 'extra'], root)).rejects.toThrow(/voices takes no arguments/);
    await expect(main(['audition', VOICE, '--prune'], root)).rejects.toThrow(/--prune does not apply to audition/);
    await expect(main(['demo', '--captions-only', '--prune'], root)).rejects.toThrow(/--prune only applies when voicing/);
    await expect(main(['demo', 'other'], root)).rejects.toThrow(/Unexpected other/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('explains a missing id, a bad id and an unknown option', async () => {
    await expect(main([], root)).rejects.toThrow(/Missing video id[\s\S]*Usage: npm run narrate/);
    await expect(main(['../../etc'], root)).rejects.toThrow(/is not a video id/);
    await expect(main(['demo', '--fast'], root)).rejects.toThrow(/Unknown option --fast/);
  });
});
