// Scene and caption timing, shared by the video (src/timeline.ts) and the Node scripts
// (scripts/timing.ts). No imports, so it runs anywhere.

/** Frames per second for every composition in the kit. */
export const FPS = 30;
/** Frames before the first line starts. */
export const START = 6;
/** Pause after each line, in seconds. */
export const GAP = 0.35;

/** One spoken word and when it starts and ends, in seconds from the start of its line. */
export type Word = { w: string; start: number; end: number };

/**
 * One narration line as stored in `public/narration/<id>/timing.json`. `file` is the
 * line's audio; captions-only timing has none, so that line plays silent.
 */
export type Line = { file?: string; text: string; seconds: number; words: Word[] };

/** A line placed on the timeline: it starts at frame `from` and lasts `frames` frames. */
export type Scene = Line & { from: number; frames: number };

/**
 * Places one scene per narration line, back to back. Each scene lasts as long as its line
 * plus {@link GAP}, rounded up to a whole frame; the first starts at frame {@link START}.
 */
export function place(lines: Line[]): Scene[] {
  const scenes: Scene[] = [];
  for (const line of lines) {
    const prev = scenes[scenes.length - 1];
    const from = prev ? prev.from + prev.frames : START;
    scenes.push({ ...line, from, frames: Math.ceil((line.seconds + GAP) * FPS) });
  }
  return scenes;
}

// A word ends a clause when it ends in punctuation or a dash, even inside closing quotes or
// brackets: `now.”`, `(again),` and `first—` all count.
const ends = (w?: Word) => !!w && /[.,:;?!…—–]["'”’)\]]*$/.test(w.w);

/**
 * Cuts a line's words into short caption chunks: after punctuation or a dash, or at seven words
 * unless the sentence ends within the next two (so no word is left alone), and never more
 * than ten. The burned-in captions and the SRT file both use it, so their chunks match.
 */
export function chunks(words: Word[]): Word[][] {
  const out: Word[][] = [];
  let cur: Word[] = [];
  words.forEach((w, i) => {
    cur.push(w);
    const nearEnd = ends(words[i + 1]) || ends(words[i + 2]);
    if (ends(w) || (cur.length >= 7 && !nearEnd) || cur.length >= 10) {
      out.push(cur);
      cur = [];
    }
  });
  if (cur.length) out.push(cur);
  return out;
}

/** Formats seconds as an SRT timestamp, for example `00:01:02,345`. */
export function stamp(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}
