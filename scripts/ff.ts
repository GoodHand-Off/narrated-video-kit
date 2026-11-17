// Runs the Remotion CLI and the ffmpeg and ffprobe that ship with it, so nothing else needs
// installing. Each tool starts with the running Node and the CLI's JavaScript entry, which
// works on Windows and in paths with spaces. Every failure becomes a KitError.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { KitError } from '../src/errors.ts';
import { ROOT } from './cli.ts';

/** Path of the Remotion CLI's JavaScript entry, installed by `npm ci`. */
export function remotionCli(root = ROOT): string {
  const manifest = join(root, 'node_modules', '@remotion', 'cli', 'package.json');
  if (!existsSync(manifest)) throw new KitError('Remotion is not installed in this folder.', 'Run `npm ci` first.');
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8')) as { bin: Record<string, string> };
  return join(dirname(manifest), bin.remotion);
}

/** Runs `remotion <args>` with its output shown live. Returns the exit code. */
export function remotion(args: string[], root = ROOT): number {
  return spawnSync(process.execPath, [remotionCli(root), ...args], { cwd: root, stdio: 'inherit' }).status ?? 1;
}

/** The lines of a tool's error output worth showing: no stack frames, at most two. */
export function errorDetail(output: string): string {
  const lines = output.split('\n').filter((l) => l.trim() && !/^\s*(at |- \/|Require stack:)/.test(l));
  return lines.slice(-2).join(' ').trim();
}

function tool(name: 'ffmpeg' | 'ffprobe', args: string[], root: string) {
  const r = spawnSync(process.execPath, [remotionCli(root), name, ...args], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status === 0) return { stdout: r.stdout, stderr: r.stderr };
  const output = `${r.stderr ?? ''}\n${r.error?.message ?? ''}`;
  if (/Cannot find module '@remotion\/compositor-/.test(output)) {
    throw new KitError(`The ${name} bundled with Remotion is missing for ${process.platform}-${process.arch}.`, 'Run `npm ci` again, without --omit=optional.');
  }
  throw new KitError(`${name} failed: ${errorDetail(output)}`, 'Check that the input is a readable audio or video file.');
}

/** Runs the bundled ffmpeg. Returns its output; loudnorm reports on stderr. */
export const ffmpeg = (args: string[], root = ROOT) => tool('ffmpeg', args, root);

/** Runs the bundled ffprobe and returns its trimmed standard output. */
export const ffprobe = (args: string[], root = ROOT): string => tool('ffprobe', args, root).stdout.trim();

/** Length of a media file in seconds. */
export function seconds(file: string, root = ROOT): number {
  const value = Number(ffprobe(['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], root));
  if (!Number.isFinite(value)) throw new KitError(`Could not read the length of ${file}.`, 'Delete the file and run the command again.');
  return value;
}
