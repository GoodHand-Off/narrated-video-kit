// What every script shares: the repo root, the entry-point check, error printing, id
// checks, argument parsing and the checks that keep secrets off the Studio page.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { KitError } from '../src/errors.ts';
import { exposedSecretsMessage } from './env-guard.ts';

/** Absolute path of the repository root. */
export const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Where the ElevenLabs key lives: a gitignored file only the narrate script reads. */
export const KEY_FILE = '.env.elevenlabs';

const KEY_LINE = /^\s*(export\s+)?ELEVENLABS_API_KEY\s*[=:]/m;
const hasKey = (root: string, file: string) => existsSync(join(root, file)) && KEY_LINE.test(readFileSync(join(root, file), 'utf8'));

/** True when the module at `url` is the script Node was started with, not one a test imported. */
export const isEntry = (url: string): boolean => !!process.argv[1] && url === pathToFileURL(process.argv[1]).href;

/**
 * Runs a script's `main`, prints any error as `Error: <what happened>` plus the next step,
 * and sets exit code 1. Unexpected errors print their message only, never a stack.
 */
export async function run(main: () => Promise<unknown> | unknown): Promise<void> {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? `Error: ${error.message}` : `Error: ${String(error)}`);
    process.exitCode = 1;
  }
}

/** Command names that cannot be video ids, because `npm run narrate -- <word>` means the command. */
export const RESERVED_IDS = ['voices', 'audition'];

/** A video id: lowercase letters, digits and dashes, as in `src/narration/<id>.json`. */
export function checkId(id: string | undefined, usage: string): string {
  if (!id) throw new KitError('Missing video id.', `Usage: ${usage}`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new KitError(`"${id}" is not a video id.`, 'Use lowercase letters, digits and dashes, matching a file in src/narration/.');
  }
  if (RESERVED_IDS.includes(id)) throw new KitError(`"${id}" is the name of a command, so it cannot be a video id.`, 'Rename the script.');
  return id;
}

/**
 * Refuses to go on when a REMOTION_* variable with a secret-like name is set in the shell or
 * in `.env`: Remotion would copy it into the Studio page and every render. remotion.config.ts
 * runs the same check for every Remotion command; this one lets a script stop early.
 */
export function checkEnvFiles(root = ROOT): void {
  const file = join(root, '.env');
  let fromFile: Record<string, string | undefined> = {};
  try {
    fromFile = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
  } catch {
    // Remotion's own loader reports a .env it cannot parse.
  }
  const problem = exposedSecretsMessage({ ...fromFile, ...process.env });
  if (problem) {
    const [message, hint] = problem.split('\n');
    throw new KitError(message, hint);
  }
}

/** The file the key was saved in by mistake (`.env` or `.env.local`), if any: the kit reads the key only from `.env.elevenlabs` or the shell. */
export function misplacedKey(root = ROOT): string | undefined {
  return ['.env', '.env.local'].find((file) => hasKey(root, file));
}

/**
 * Splits a command line into positional arguments and `--flags`, in any order, and rejects
 * flags the command does not take. A flag listed in `withValue` takes the next argument.
 * Also catches a kit flag that npm took for itself because it came before `--`
 * (`npm run narrate --captions-only x` sets npm_config_captions_only instead).
 */
export function parseArgs(argv: string[], usage: string, flags: string[] = [], withValue: string[] = [], env: NodeJS.ProcessEnv = process.env) {
  for (const flag of [...flags, ...withValue]) {
    if (env[`npm_config_${flag.slice(2).replace(/-/g, '_')}`] !== undefined) {
      throw new KitError(`npm took ${flag} as its own option, because it came before \`--\`.`, `Put \`--\` before the kit's arguments. Usage: ${usage}`);
    }
  }
  const positional: string[] = [];
  const options = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
    } else if (withValue.includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new KitError(`${arg} needs a value.`, `Usage: ${usage}`);
      options.set(arg, value);
    } else if (flags.includes(arg)) {
      options.set(arg, true);
    } else {
      throw new KitError(`Unknown option ${arg}.`, `Usage: ${usage}`);
    }
  }
  return { positional, options };
}
