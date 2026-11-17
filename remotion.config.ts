// Remotion runs this file at the start of every command (studio, render, still, bundle and
// the rest, including plain `npx remotion ...`).
//
// By default Remotion copies every variable from .env (or .env.local when there is no .env)
// into the Studio page and every render, and reloads that file while Studio runs; Studio is
// reachable from other devices on the network. Here Remotion gets an empty env file created
// for this run in a new private directory (only your user can open it), removed when the
// command exits. What still reaches the page is any variable named REMOTION_*, from your shell
// or from .env (Remotion's CLI loads .env at start); this file refuses to start when one of
// those looks like a secret.
import { Config } from '@remotion/cli/config';
import { exposedSecretsMessage, privateEmptyEnvFile } from './scripts/env-guard.ts';

const problem = exposedSecretsMessage(process.env);
if (problem) throw new Error(problem);

const env = privateEmptyEnvFile();
process.on('exit', env.cleanup);
// Node ends on SIGTERM and SIGHUP without running exit handlers: clean up, then let the
// signal end the process as it would have.
for (const signal of ['SIGTERM', 'SIGHUP'] as const) {
  process.once(signal, () => {
    env.cleanup();
    process.kill(process.pid, signal);
  });
}
Config.setDotEnvLocation(env.file);
