// Writes an SRT captions file from a video's narration timing, chunked like the burned-in
// captions, so YouTube's captions match the picture.
//   npm run srt -- explainer out/explainer.srt
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { KitError } from '../src/errors.ts';
import { ROOT, checkId, isEntry, parseArgs, run } from './cli.ts';
import { parseTiming, toSrt } from './timing.ts';

const USAGE = 'npm run srt -- <id> <output.srt>';

/** Reads and validates `public/narration/<id>/timing.json`. */
export function readTiming(id: string, root = ROOT) {
  const rel = `public/narration/${id}/timing.json`;
  const file = join(root, rel);
  if (!existsSync(file)) throw new KitError(`There is no timing for "${id}" at ${rel}.`, `Run \`npm run narrate -- ${id} --captions-only\` first, or without the flag to voice it.`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    raw = null;
  }
  return parseTiming(raw, rel, id);
}

/** True when any line of video `id` has voiced audio; false for captions-only timing. */
export const narrated = (id: string, root = ROOT): boolean => readTiming(id, root).some((line) => line.file);

/** Writes the SRT for video `id` to `output` and returns the number of cues. */
export function writeSrt(id: string, output: string, root = ROOT): number {
  const srt = toSrt(readTiming(id, root));
  mkdirSync(dirname(resolve(output)), { recursive: true });
  writeFileSync(output, srt);
  return srt.trim().split('\n\n').length;
}

/** The command line: `<id> <output.srt>`. */
export function main(argv: string[], root = ROOT): void {
  const [id, output, ...rest] = parseArgs(argv, USAGE).positional;
  checkId(id, USAGE);
  if (!output) throw new KitError('Missing the output file.', `Usage: ${USAGE}`);
  if (rest.length) throw new KitError(`Unexpected ${rest.join(' ')}.`, `Usage: ${USAGE}`);
  console.log(`${output}: ${writeSrt(id, output, root)} cues`);
}

if (isEntry(import.meta.url)) await run(() => main(process.argv.slice(2)));
