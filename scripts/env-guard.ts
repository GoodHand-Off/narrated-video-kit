import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// What Remotion can publish. Its CLI loads .env into its own process at start, then copies
// every variable named REMOTION_* (and everything in its env file) into the Studio page and
// every render. remotion.config.ts gives it a private empty env file for each run (below), so
// only REMOTION_* names are left, and exposedSecrets refuses the ones that look like secrets.

/** Words in a variable name that mark it as a secret. */
const SECRET = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|PRIVATE)/i;

/** The REMOTION_* variables in `env` whose names look like secrets, sorted. */
export function exposedSecrets(env: Record<string, string | undefined>): string[] {
  return Object.keys(env)
    .filter((name) => name.startsWith('REMOTION_') && SECRET.test(name))
    .sort();
}

/** The error to stop on when {@link exposedSecrets} finds any, or null. */
export function exposedSecretsMessage(env: Record<string, string | undefined>): string | null {
  const names = exposedSecrets(env);
  if (names.length === 0) return null;
  return (
    `${names.join(', ')} would be copied into the Studio page and every render: Remotion publishes every ` +
    'variable whose name starts with REMOTION_, from your shell or from .env.\n' +
    'Remove it, or rename it without the REMOTION_ prefix. Keep the ElevenLabs key in .env.elevenlabs.'
  );
}

/**
 * Creates the empty env file Remotion is pointed at, for one run: a new directory under the
 * system temp folder with a random name (mode 0700, so only you can open it), holding an
 * empty file created exclusively with mode 0600, so no existing path or link is followed.
 * Call `cleanup` when the command ends; it removes the directory.
 */
export function privateEmptyEnvFile(): { file: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'narrated-video-kit-env-'));
  const file = join(dir, 'empty.env');
  writeFileSync(file, '', { flag: 'wx', mode: 0o600 });
  return { file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
