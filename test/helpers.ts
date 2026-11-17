// Shared test fixtures: a throwaway project folder that reuses this repo's node_modules,
// and small real media files made with the ffmpeg bundled with Remotion.
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../scripts/cli.ts';
import { ffmpeg } from '../scripts/ff.ts';

/** A temporary project root with node_modules linked in. Call `cleanup` when done. */
export function tempRoot(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'nvk-'));
  symlinkSync(join(ROOT, 'node_modules'), join(root, 'node_modules'));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/** Writes a narration script to `<root>/src/narration/<id>.json`. */
export function writeScript(root: string, id: string, script: unknown): void {
  mkdirSync(join(root, 'src/narration'), { recursive: true });
  writeFileSync(join(root, 'src/narration', `${id}.json`), typeof script === 'string' ? script : JSON.stringify(script));
}

/** Writes a timing file to `<root>/public/narration/<id>/timing.json`. */
export function writeTiming(root: string, id: string, timing: unknown): void {
  mkdirSync(join(root, 'public/narration', id), { recursive: true });
  writeFileSync(join(root, 'public/narration', id, 'timing.json'), typeof timing === 'string' ? timing : JSON.stringify(timing));
}

/** A one-second tone (`sine`) or silence (`silent`) as a file in `dir`. */
export function media(dir: string, kind: 'sine' | 'silent', name: string): string {
  const file = join(dir, name);
  const source = kind === 'sine' ? 'sine=frequency=440:sample_rate=48000' : 'anullsrc=r=48000:cl=mono';
  ffmpeg(['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', source, '-t', '1', file]);
  return file;
}

/** ElevenLabs-style character alignment for `text`, 0.05 seconds per character. */
export function alignmentFor(text: string) {
  const characters = [...text];
  return {
    characters,
    character_start_times_seconds: characters.map((_, i) => (i * 50) / 1000),
    character_end_times_seconds: characters.map((_, i) => (i * 50 + 40) / 1000),
  };
}
