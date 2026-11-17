// One command from timing to a finished video: render, level the narration, write the SRT.
//   npm run make -- explainer        out/explainer.mp4 and out/explainer.srt (1080x1920)
//   npm run make -- explainer-wide   out/explainer-wide.mp4 and .srt (1920x1080)
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { KitError } from '../src/errors.ts';
import { ROOT, checkEnvFiles, checkId, isEntry, parseArgs, run } from './cli.ts';
import { remotion, seconds } from './ff.ts';
import { finish, report } from './finish.ts';
import { narrated, writeSrt } from './srt.ts';

const USAGE = 'npm run make -- <id> | <id>-wide';

/** Runs the Remotion CLI and returns its exit code; tests pass a stand-in. */
export type Runner = (args: string[], root: string) => number;

/** What {@link make} produced. */
export type Made = { video: string; captions: string; seconds: number; cues: number; audio: string };

/**
 * Renders composition `target` (a video id, or `<id>-wide` for the 16:9 cut) and writes
 * `out/<target>.mp4` and `out/<target>.srt`. The audio is leveled to -14 LUFS when the video
 * has narration; a captions-only video keeps its sound effects as rendered, because leveling
 * them alone would push them far too loud.
 */
export function make(target: string, root = ROOT, runRemotion: Runner = remotion): Made {
  checkId(target, USAGE);
  checkEnvFiles(root);
  const id = target.replace(/-wide$/, '');
  if (!existsSync(join(root, 'public/narration', id, 'timing.json'))) {
    throw new KitError(`There is no timing for "${id}" yet.`, `Run \`npm run narrate -- ${id} --captions-only\` (no key needed), or without the flag to voice it.`);
  }
  const hasNarration = narrated(id, root);
  if (runRemotion(['browser', 'ensure'], root) !== 0) {
    throw new KitError(
      'Remotion could not get ready to render; its error is above.',
      'If it could not download Chrome Headless Shell (once, on the first render), check your connection or proxy and run the command again. On Linux, also install the libraries listed at https://www.remotion.dev/docs/miscellaneous/linux-dependencies.',
    );
  }
  const raw = join(root, 'out', `${target}-raw.mp4`);
  const video = join(root, 'out', `${target}.mp4`);
  const captions = join(root, 'out', `${target}.srt`);
  if (runRemotion(['render', 'src/index.ts', target, raw, '--codec=h264', '--crf=18'], root) !== 0) {
    throw new KitError(`Remotion could not render "${target}".`, 'Read the error above. `npx remotion compositions src/index.ts` lists every composition id.');
  }
  let audio: string;
  if (hasNarration) {
    audio = report(video, finish(raw, video, root));
  } else {
    copyFileSync(raw, video);
    audio = `${video}: captions only, so the audio (sound effects) was left as rendered`;
  }
  rmSync(raw, { force: true });
  const cues = writeSrt(id, captions, root);
  return { video, captions, seconds: seconds(video, root), cues, audio };
}

/** The command line: `<id>` or `<id>-wide`. */
export function main(argv: string[], root = ROOT, runRemotion: Runner = remotion): void {
  const [target, ...rest] = parseArgs(argv, USAGE).positional;
  if (rest.length) throw new KitError(`Unexpected ${rest.join(' ')}.`, `Usage: ${USAGE}`);
  const made = make(target, root, runRemotion);
  console.log(`${made.audio}\n${made.video} (${made.seconds.toFixed(1)} seconds)\n${made.captions} (${made.cues} cues)`);
}

if (isEntry(import.meta.url)) await run(() => main(process.argv.slice(2)));
