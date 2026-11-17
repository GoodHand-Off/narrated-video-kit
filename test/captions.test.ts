import { describe, expect, it } from 'vitest';
import { FPS, GAP, START, chunks, place, stamp, type Line, type Word } from '../src/captions.ts';

const words = (text: string): Word[] => text.split(' ').map((w, i) => ({ w, start: i * 0.3, end: i * 0.3 + 0.25 }));
const line = (text: string, seconds: number): Line => ({ text, seconds, words: words(text) });

describe('place', () => {
  it('starts the first scene after the lead-in and chains the rest', () => {
    const scenes = place([line('One two.', 1), line('Three four five.', 2.5)]);
    expect(scenes[0].from).toBe(START);
    expect(scenes[0].frames).toBe(Math.ceil((1 + GAP) * FPS));
    expect(scenes[1].from).toBe(scenes[0].from + scenes[0].frames);
    expect(scenes[1].frames).toBe(Math.ceil((2.5 + GAP) * FPS));
  });

  it('keeps each line’s text and words', () => {
    const [scene] = place([line('Hello there.', 1)]);
    expect(scene.text).toBe('Hello there.');
    expect(scene.words.map((w) => w.w)).toEqual(['Hello', 'there.']);
  });
});

describe('chunks', () => {
  const text = (parts: Word[][]) => parts.map((p) => p.map((w) => w.w).join(' '));

  it('breaks after punctuation', () => {
    expect(text(chunks(words('Short one. Then another, and the end.')))).toEqual(['Short one.', 'Then another,', 'and the end.']);
  });

  it('breaks after punctuation inside closing quotes and brackets, and after dashes', () => {
    expect(text(chunks(words('It said “stop.” Then (again), and once more— the end.')))).toEqual(['It said “stop.”', 'Then (again),', 'and once more—', 'the end.']);
  });

  it('breaks long runs at seven words', () => {
    const parts = chunks(words('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen'));
    expect(parts[0]).toHaveLength(7);
  });

  it('never leaves a word on its own before the end of a sentence', () => {
    // Words 7 and 8 end the sentence, so the first chunk runs on to include them.
    expect(text(chunks(words('one two three four five six seven eight.')))).toEqual(['one two three four five six seven eight.']);
  });

  it('caps a chunk at ten words', () => {
    const parts = chunks(words('a b c d e f g h i j k l. m'));
    expect(Math.max(...parts.map((p) => p.length))).toBeLessThanOrEqual(10);
  });

  it('keeps every word exactly once, in order', () => {
    const all = words('The voice comes back with a time for every word. Anything on screen can wait for its word, like this message.');
    expect(chunks(all).flat()).toEqual(all);
  });
});

describe('stamp', () => {
  it('formats SRT timestamps', () => {
    expect(stamp(0)).toBe('00:00:00,000');
    expect(stamp(62.3456)).toBe('00:01:02,346');
    expect(stamp(3723.5)).toBe('01:02:03,500');
  });
});
