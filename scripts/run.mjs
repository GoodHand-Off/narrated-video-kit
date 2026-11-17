// Starts a kit command after the checks a stranger can trip over: the Node version, whether
// `npm ci` has run, and whether remotion.config.ts (which keeps env files off the Studio
// page) is in place. Plain JavaScript, so it works before anything is installed. Each tool
// starts with the running Node and its own JavaScript entry, which also works on Windows
// and in folders whose names contain spaces. SIGINT, SIGTERM and SIGHUP sent to this process
// are passed on, so stopping the command stops the tool.
//   node scripts/run.mjs <script> [args]     runs scripts/<script>.ts with tsx
//   node scripts/run.mjs remotion [args]     runs the Remotion CLI
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function fail(message, hint) {
  console.error(`Error: ${message}\n${hint}`);
  process.exit(1);
}

const [major, minor] = process.versions.node.split('.').map(Number);
if (!(major > 22 || (major === 22 && minor >= 13) || (major === 20 && minor >= 19))) {
  fail(`this kit needs Node 22.13+ or 24+ (20.19+ also works); this is Node ${process.versions.node}.`, 'Install a current version from https://nodejs.org, then run `npm ci` again.');
}

const [command, ...args] = process.argv.slice(2);

// remotion.config.ts gives Remotion a private empty env file and refuses secret-like
// REMOTION_* variables; without it Remotion copies .env (or .env.local when there is no
// .env) into the Studio page.
if (command === 'remotion' && !existsSync(join(root, 'remotion.config.ts'))) {
  fail(
    'remotion.config.ts is missing. Without it Remotion copies .env (or .env.local when there is no .env) into the Studio page.',
    'Restore it with `git checkout -- remotion.config.ts`.',
  );
}

// The JavaScript file a package runs for its command, from its package.json "bin".
function entry(pkg, name) {
  const manifest = join(root, 'node_modules', pkg, 'package.json');
  if (!existsSync(manifest)) fail('the dependencies are not installed.', 'Run `npm ci` in this folder first.');
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8'));
  return join(dirname(manifest), typeof bin === 'string' ? bin : bin[name]);
}

const argv =
  command === 'remotion' ? [entry('@remotion/cli', 'remotion'), ...args] : [entry('tsx', 'tsx'), join(root, 'scripts', `${command}.ts`), ...args];
const child = spawn(process.execPath, argv, { cwd: root, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => child.kill(signal));
}
child.on('error', (error) => fail(`could not start ${command}: ${error.message}`, 'Run `npm ci` again.'));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 128 + ({ SIGHUP: 1, SIGINT: 2, SIGTERM: 15 }[signal] ?? 0) : 1)));
