// Levels a rendered video's audio to -14 LUFS (where Shorts, Reels, TikTok and YouTube play
// back) with two loudnorm passes, copies the picture untouched, then measures the result.
//   npm run finish -- out/explainer-raw.mp4 out/explainer.mp4 --video explainer
// --video names the video so finish can check its timing: a captions-only video (sound
// effects, no narration) is copied unchanged, as `npm run make` does, because leveling
// sound effects alone would make them far too loud. --force levels any file without a check.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { KitError } from '../src/errors.ts';
import { ROOT, checkId, isEntry, parseArgs, run } from './cli.ts';
import { narrated } from './srt.ts';
import { ffmpeg, ffprobe } from './ff.ts';

/**
 * The loudness target: -14 LUFS integrated, -2 dBTP true peak (headroom for the AAC encode
 * and the platforms' own re-encode), 11 LU range.
 */
export const TARGET = 'I=-14:TP=-2:LRA=11';
const USAGE = 'npm run finish -- <input.mp4> <output.mp4> --video <id> | --force';

/** What loudnorm measured: integrated loudness (LUFS) and true peak (dBTP). */
export type Loudness = { lufs: number; peak: number };

/** Reads loudnorm's JSON report from the end of ffmpeg's stderr. */
export function parseLoudnorm(stderr: string, file: string): Record<string, string> {
  try {
    return JSON.parse(stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1));
  } catch {
    throw new KitError(`Could not measure the loudness of ${file}.`, 'Check that the file plays, then run the command again.');
  }
}

function measure(file: string, root: string): Record<string, string> {
  const { stderr } = ffmpeg(['-hide_banner', '-i', file, '-af', `loudnorm=${TARGET}:print_format=json`, '-vn', '-f', 'null', '-'], root);
  return parseLoudnorm(stderr, file);
}

/** Measures a file's integrated loudness and true peak, or null when it has no audible track. */
export function loudness(file: string, root = ROOT): Loudness | null {
  const hasAudio = ffprobe(['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file], root) !== '';
  if (!hasAudio) return null;
  const m = measure(file, root);
  const lufs = Number(m.input_i);
  return Number.isFinite(lufs) ? { lufs, peak: Number(m.input_tp) } : null;
}

/**
 * Levels `input` into `output` and returns the loudness before and after. A file with no
 * audio, or only silence, is copied unchanged and returns null.
 */
export function finish(input: string, output: string, root = ROOT): { before: Loudness; after: Loudness } | null {
  if (!existsSync(input)) throw new KitError(`There is no file at ${input}.`, 'Render first, for example `npm run render -- explainer out/explainer-raw.mp4`.');
  if (resolve(input) === resolve(output)) throw new KitError('The output would overwrite the input.', 'Give the finished file a different name.');
  mkdirSync(dirname(resolve(output)), { recursive: true });
  const before = loudness(input, root);
  if (!before) {
    copyFileSync(input, output);
    return null;
  }
  const m = measure(input, root);
  const filter =
    `loudnorm=${TARGET}:measured_I=${m.input_i}:measured_TP=${m.input_tp}` +
    `:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  ffmpeg(['-y', '-loglevel', 'error', '-i', input, '-c:v', 'copy', '-af', filter, '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', output], root);
  const after = loudness(output, root);
  if (!after) throw new KitError(`${output} came out with no audible track.`, 'Check the input plays with sound, then run the command again.');
  return { before, after };
}

/** One line describing what {@link finish} did. */
export function report(output: string, result: ReturnType<typeof finish>): string {
  return result
    ? `${output}: audio leveled from ${result.before.lufs.toFixed(1)} to ${result.after.lufs.toFixed(1)} LUFS, true peak ${result.after.peak.toFixed(1)} dBTP`
    : `${output}: no audible track, copied unchanged`;
}

/** The command line: `<input> <output> --video <id>` or `--force`, in any order. */
export function main(argv: string[], root = ROOT): void {
  const { positional, options } = parseArgs(argv, USAGE, ['--force'], ['--video']);
  const [input, output, ...rest] = positional;
  if (!input || !output) throw new KitError('Missing the input or output file.', `Usage: ${USAGE}`);
  if (rest.length) throw new KitError(`Unexpected ${rest.join(' ')}.`, `Usage: ${USAGE}`);
  const video = options.get('--video');
  if (typeof video !== 'string' && !options.has('--force')) {
    throw new KitError(
      'finish needs --video <id> to check whether the render has narration.',
      'Leveling sound effects alone makes them far too loud. Name the video with --video <id>, or add --force to level any file.',
    );
  }
  if (typeof video === 'string' && !narrated(checkId(video, USAGE), root)) {
    if (!existsSync(input)) throw new KitError(`There is no file at ${input}.`, 'Render first, for example `npm run render -- explainer out/explainer-raw.mp4`.');
    mkdirSync(dirname(resolve(output)), { recursive: true });
    copyFileSync(input, output);
    console.log(`${output}: "${video}" has no narration, so the audio (sound effects) was left as rendered`);
    return;
  }
  console.log(report(output, finish(input, output, root)));
}

if (isEntry(import.meta.url)) await run(() => main(process.argv.slice(2)));
