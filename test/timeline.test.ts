import { describe, expect, it } from 'vitest';
import { FPS, place } from '../src/captions.ts';
import { KitError } from '../src/errors.ts';
import { END_HOLD, HOOK_STILL, WIDE_END_HOLD, headline, sheetSize, tileOf, timeline, wideFrames } from '../src/timeline.ts';
import { captionsOnly } from '../scripts/timing.ts';

const lines = [captionsOnly('Hello there, hello again.'), captionsOnly('It lands right NOW.')];

describe('timeline', () => {
  const t = timeline(lines);

  it('places the scenes and adds the end hold to the length', () => {
    const scenes = place(lines);
    expect(t.scenes).toEqual(scenes);
    const last = scenes[1];
    expect(t.frames).toBe(last.from + last.frames + Math.round(END_HOLD * FPS));
  });

  it('finds a word in its scene, ignoring case and punctuation', () => {
    const now = t.scenes[1].words[3];
    expect(t.cue(1, 'now')).toBe(Math.round(now.start * FPS));
    expect(t.cue(0, 'THERE')).toBe(Math.round(t.scenes[0].words[1].start * FPS));
  });

  it('picks the nth repeat, and throws when the line has fewer', () => {
    expect(t.cue(0, 'hello', 1)).toBe(Math.round(t.scenes[0].words[2].start * FPS));
    expect(() => t.cue(0, 'hello', 5)).toThrow(/"hello" is spoken 2 time\(s\) in line 1, so there is no repeat number 5/);
  });

  it('throws a KitError for a word that is not spoken, quoting the line', () => {
    expect(() => t.cue(1, 'later')).toThrow(KitError);
    expect(() => t.cue(1, 'later')).toThrow(/"later" is not spoken in line 2: "It lands right NOW\."/);
  });

  it('throws a KitError for a scene that does not exist', () => {
    expect(() => t.cue(7, 'now')).toThrow(/There is no scene 8; the video has 2/);
  });

  it('reviews the hook, then each scene just before it ends', () => {
    expect(t.review).toEqual([HOOK_STILL, ...t.scenes.map((s) => s.from + s.frames - 4)]);
  });

  it('refuses empty timing with the command that rebuilds it', () => {
    expect(() => timeline([])).toThrow(/narrate -- <id> --captions-only/);
  });
});

describe('wideFrames', () => {
  it('adds the longer wide end hold', () => {
    expect(wideFrames(100)).toBe(100 + Math.round((WIDE_END_HOLD - END_HOLD) * FPS));
  });
});

describe('headline', () => {
  it('uses the hook lines for the first scene', () => {
    expect(headline('ignored', ['No camera.', 'Just a script.'])).toBe('No camera. Just a script');
  });

  it('uses the first sentence and drops its full stop', () => {
    expect(headline('Each line becomes one scene. The rest follows.')).toBe('Each line becomes one scene');
    expect(headline('No voice key yet? Then this.')).toBe('No voice key yet?');
  });

  it('ends the first sentence inside closing quotes', () => {
    expect(headline('It said “stop.” Then it stopped.')).toBe('It said “stop.”');
  });

  it('cuts a long sentence back to its first clause', () => {
    const text = 'Then one command levels the audio to minus fourteen LUFS, and a review sheet shows every scene.';
    expect(headline(text)).toBe('Then one command levels the audio to minus fourteen LUFS');
    const dashed = 'Then one command levels the audio to minus fourteen LUFS—and a review sheet shows every scene.';
    expect(headline(dashed)).toBe('Then one command levels the audio to minus fourteen LUFS');
  });

  it('cuts a long clause at a word boundary with an ellipsis', () => {
    const text = 'word '.repeat(30).trim() + '.';
    const h = headline(text);
    expect(h.endsWith('…')).toBe(true);
    expect(h.length).toBeLessThanOrEqual(71);
    expect(h).not.toMatch(/ …$/);
  });
});

describe('review sheet size', () => {
  it('tiles vertical videos 270x480 and wide ones 480x270, in two rows', () => {
    expect(tileOf(false)).toEqual({ w: 270, h: 480, full: 1080 });
    expect(tileOf(true)).toEqual({ w: 480, h: 270, full: 1920 });
    expect(sheetSize([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual({ width: 5 * 270, height: 960 });
    expect(sheetSize([1, 2, 3, 4], true)).toEqual({ width: 2 * 480, height: 540 });
  });
});

describe('KitError', () => {
  it('carries the next step as a hint and in its message', () => {
    const e = new KitError('It broke.', 'Do this.');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('Error'); // Remotion shows the name as a badge, so it stays plain
    expect(e.hint).toBe('Do this.');
    expect(e.message).toBe('It broke.\nDo this.');
  });
});
