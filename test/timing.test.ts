import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FPS, place } from '../src/captions.ts';
import { KitError } from '../src/errors.ts';
import { MAX_LINE, PACE, captionsOnly, lineHash, parseScript, parseSidecar, parseSpeech, parseTiming, toSrt, wordsFromAlignment } from '../scripts/timing.ts';
import { alignmentFor } from './helpers.ts';

describe('parseScript', () => {
  const ok = { lines: ['One.', 'Two.'] };

  it('accepts a script with or without voice and model, ignoring other fields', () => {
    expect(parseScript({ ...ok, title: 'ignored' }, 'f.json')).toEqual({ ...ok, voice: undefined, model: undefined });
    expect(parseScript({ ...ok, voice: 'JBFqnCBsd6RMkjVDRZzb', model: 'eleven_v4' }, 'f.json').voice).toBe('JBFqnCBsd6RMkjVDRZzb');
  });

  it.each([
    ['not an object', [], /f\.json is not a JSON object/],
    ['a bad voice', { ...ok, voice: 'not a voice!' }, /not an ElevenLabs voice ID/],
    ['a bad model', { ...ok, model: 'Eleven V4' }, /invalid "model"/],
    ['no lines', { lines: [] }, /needs "lines"/],
    ['an empty line', { lines: ['a', '  '] }, /line 2 is empty/],
    ['a line that is too long', { lines: ['x'.repeat(MAX_LINE + 1)] }, /line 1 is 10001 characters/],
  ])('rejects %s, naming the file and field', (_, raw, message) => {
    expect(() => parseScript(raw, 'f.json')).toThrow(KitError);
    expect(() => parseScript(raw, 'f.json')).toThrow(message);
  });
});

describe('parseTiming', () => {
  const good = [captionsOnly('One two.'), { file: '0123456789abcdef.mp3', hash: '0123456789abcdef', text: 'x', seconds: 1, words: [{ w: 'x', start: 0, end: 1 }] }];

  it('accepts captions-only and voiced entries', () => {
    expect(parseTiming(good, 't.json', 'demo')).toBe(good);
  });

  it.each([
    ['an empty file', []],
    ['a non-array', { lines: [] }],
    ['a zero-length line', [{ text: 'x', seconds: 0, words: [] }]],
    ['a bad word', [{ text: 'x', seconds: 1, words: [{ w: 1, start: 0, end: 1 }] }]],
    ['an unsafe audio file name', [{ file: '../x.mp3', text: 'x', seconds: 1, words: [] }]],
  ])('rejects %s with the command that rebuilds it', (_, raw) => {
    expect(() => parseTiming(raw, 't.json', 'demo')).toThrow(/narrate -- demo --captions-only/);
  });
});

describe('parseSidecar', () => {
  it('accepts a complete sidecar and rejects a partial one', () => {
    const ok = { text: 'x', seconds: 1, words: [{ w: 'x', start: 0, end: 1 }] };
    expect(parseSidecar(ok)).toBe(ok);
    expect(parseSidecar({ text: 'x', seconds: 0, words: [] })).toBeNull();
    expect(parseSidecar({ text: 'x', seconds: 1 })).toBeNull();
    expect(parseSidecar(null)).toBeNull();
  });
});

describe('parseSpeech', () => {
  const audio = Buffer.from('mp3').toString('base64');

  it('returns the audio and alignment', () => {
    const r = parseSpeech({ audio_base64: audio, alignment: alignmentFor('Hi') }, 1);
    expect(r.audio.toString()).toBe('mp3');
    expect(r.alignment.characters).toEqual(['H', 'i']);
  });

  it('falls back to the normalized alignment', () => {
    expect(parseSpeech({ audio_base64: audio, alignment: null, normalized_alignment: alignmentFor('Yo') }, 1).alignment.characters).toEqual(['Y', 'o']);
  });

  it('rejects a response with no audio', () => {
    expect(() => parseSpeech({ alignment: alignmentFor('Hi') }, 3)).toThrow(/no audio for line 3/);
  });

  it('rejects missing or inconsistent timings and suggests another model', () => {
    expect(() => parseSpeech({ audio_base64: audio }, 2)).toThrow(/no word timings for line 2/);
    const broken = { ...alignmentFor('Hi'), character_end_times_seconds: [0.1] };
    expect(() => parseSpeech({ audio_base64: audio, alignment: broken }, 2)).toThrow(/eleven_multilingual_v2/);
  });
});

describe('wordsFromAlignment', () => {
  it('groups character timings into words and skips spaces', () => {
    expect(wordsFromAlignment(alignmentFor('Hi there.'))).toEqual([
      { w: 'Hi', start: 0, end: 0.09 },
      { w: 'there.', start: 0.15, end: 0.44 },
    ]);
  });
});

describe('captionsOnly', () => {
  it('spreads the words at the narrator pace, with no audio file', () => {
    const t = captionsOnly('one two three four five six seven');
    expect(t.file).toBeUndefined();
    expect(t.captionsOnly).toBe(true);
    expect(t.seconds).toBeCloseTo(7 / PACE, 2);
    for (let i = 1; i < t.words.length; i++) expect(t.words[i].start).toBeGreaterThan(t.words[i - 1].end);
    expect(t.words[t.words.length - 1].end).toBeLessThanOrEqual(t.seconds);
  });

  it('ignores stray whitespace', () => {
    expect(captionsOnly('  two   words ').words.map((w) => w.w)).toEqual(['two', 'words']);
  });
});

describe('lineHash', () => {
  it('changes with the model, the voice or the text', () => {
    const base = lineHash('m', 'v', 'text');
    expect(lineHash('m', 'v', 'text')).toBe(base);
    expect(new Set([base, lineHash('m2', 'v', 'text'), lineHash('m', 'v2', 'text'), lineHash('m', 'v', 'text!')]).size).toBe(4);
  });
});

describe('toSrt', () => {
  it('numbers cues from 1 and times them like the picture', () => {
    const lines = [captionsOnly('First line here.'), captionsOnly('Second, and last.')];
    const cues = toSrt(lines).trim().split('\n\n');
    expect(cues).toHaveLength(3);
    // Line 1: 3 words at 2.8 a second = 1.07 s, so the scene is ceil((1.07 + 0.35) * 30) = 43
    // frames from frame 6. Its only cue starts at 6 / 30 s and ends with the scene, at 49 / 30 s.
    expect(cues[0]).toBe('1\n00:00:00,200 --> 00:00:01,633\nFirst line here.');
    const second = place(lines)[1];
    expect(second.from).toBe(49);
    expect(cues[1]).toBe(`2\n00:00:01,633 --> 00:00:0${(49 / FPS + lines[1].words[1].start).toFixed(3).replace('.', ',')}\nSecond,`);
    expect(cues[2].split('\n')[2]).toBe('and last.');
  });
});

describe('the example', () => {
  it('ships captions-only timing for every line of its script, and no voice', () => {
    const script = parseScript(JSON.parse(readFileSync('src/narration/explainer.json', 'utf8')), 'explainer.json');
    const timing = parseTiming(JSON.parse(readFileSync('public/narration/explainer/timing.json', 'utf8')), 'timing.json', 'explainer');
    expect(script.voice).toBeUndefined();
    expect(timing.map((t) => t.text)).toEqual(script.lines);
    expect(timing).toEqual(script.lines.map((l) => captionsOnly(l)));
  });
});
