// Timing for a whole video: scene placement, word cues, review frames and the extra
// frames the wide cut needs. Pure functions, no React, so they are easy to test.
import { FPS, place, type Line, type Scene } from './captions';
import { KitError } from './errors';

/** Seconds the end card stays up after the last word of the vertical video. */
export const END_HOLD = 3.5;
/** Seconds the end card stays up on the wide cut, long enough for a YouTube end screen. */
export const WIDE_END_HOLD = 8;
/** The frame a review sheet shows for the opening hook. */
export const HOOK_STILL = 12;

const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, '');

/** What {@link timeline} returns for one video. */
export type Timeline = {
  /** One scene per narration line. */
  scenes: Scene[];
  /**
   * The frame, counted from the start of scene `i`, where `word` is spoken. Matching
   * ignores case and punctuation; `nth` (from 0) picks a later repeat of the same word.
   * @throws KitError if the line does not say the word that many times, so a stale cue
   * stops the render instead of drifting.
   */
  cue: (i: number, word: string, nth?: number) => number;
  /** Frames a review sheet should show: the hook, then each scene just before it ends. */
  review: number[];
  /** Length of the vertical video in frames, end card included. */
  frames: number;
};

/** Builds the timeline of a video from its narration timing. */
export function timeline(lines: Line[]): Timeline {
  if (lines.length === 0) {
    throw new KitError('The narration timing has no lines.', 'Run `npm run narrate -- <id> --captions-only` to rebuild it from the script.');
  }
  const scenes = place(lines);
  const last = scenes[scenes.length - 1];
  const cue = (i: number, word: string, nth = 0) => {
    const scene = scenes[i];
    if (!scene) throw new KitError(`There is no scene ${i + 1}; the video has ${scenes.length}.`, 'Check the scene index passed to cue().');
    const hits = scene.words.filter((w) => norm(w.w) === norm(word));
    if (hits.length === 0) {
      throw new KitError(`"${word}" is not spoken in line ${i + 1}: "${scene.text}"`, 'Change the cue to a word in that line, or re-run narrate if you edited the script.');
    }
    const hit = hits[nth];
    if (!hit) {
      throw new KitError(`"${word}" is spoken ${hits.length} time(s) in line ${i + 1}, so there is no repeat number ${nth}.`, 'Lower the nth argument of cue(), counting from 0.');
    }
    return Math.round(hit.start * FPS);
  };
  const review = [HOOK_STILL, ...scenes.map((s) => s.from + s.frames - 4)];
  return { scenes, cue, review, frames: last.from + last.frames + Math.round(END_HOLD * FPS) };
}

/** Length of the wide cut in frames, given the vertical video's length. */
export const wideFrames = (frames: number): number => frames + Math.round((WIDE_END_HOLD - END_HOLD) * FPS);

const MAX_HEADLINE = 70;

/**
 * The wide cut's headline for a scene: the hook lines for the first scene, otherwise the
 * first sentence of its narration, cut back to the first clause and then to whole words
 * when it runs past 70 characters.
 */
export function headline(text: string, hook?: string[]): string {
  let h = hook ? hook.join(' ') : text.split(/(?<=[.?!]["'”’)]*)\s/)[0];
  if (h.length > MAX_HEADLINE) h = h.split(/[,:;—–]\s?/)[0].trim();
  if (h.length > MAX_HEADLINE) h = `${h.slice(0, h.lastIndexOf(' ', MAX_HEADLINE))}…`;
  return h.replace(/[.,:;]$/, '');
}

/** A review sheet tile: its size and the full frame it scales down from. */
export const tileOf = (wide: boolean) => (wide ? { w: 480, h: 270, full: 1920 } : { w: 270, h: 480, full: 1080 });

/** Composition size for a review sheet of `frames`, tiled in two rows. */
export function sheetSize(frames: number[], wide = false): { width: number; height: number } {
  const tile = tileOf(wide);
  return { width: Math.ceil(frames.length / 2) * tile.w, height: tile.h * 2 };
}
