import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { KitError } from '../src/errors.ts';
import { ROOT, checkEnvFiles, checkId, isEntry, misplacedKey, parseArgs, run } from '../scripts/cli.ts';
import { errorDetail, ffmpeg, ffprobe, remotionCli, seconds } from '../scripts/ff.ts';
import { TARGET, finish, loudness, main as finishMain, parseLoudnorm, report } from '../scripts/finish.ts';
import { main as makeMain, make, type Runner } from '../scripts/make.ts';
import { main as srtMain, readTiming, writeSrt } from '../scripts/srt.ts';
import { captionsOnly } from '../scripts/timing.ts';
import { exposedSecrets, exposedSecretsMessage, privateEmptyEnvFile } from '../scripts/env-guard.ts';
import { media, tempRoot, writeTiming } from './helpers.ts';

let fixture: ReturnType<typeof tempRoot>;
let root: string;
let tone: string;
let silence: string;

beforeAll(() => {
  fixture = tempRoot();
  root = fixture.root;
  tone = media(root, 'sine', 'tone.wav');
  silence = media(root, 'silent', 'silence.wav');
  writeTiming(root, 'demo', [captionsOnly('First line here.'), captionsOnly('Second, and last.')]);
  writeTiming(root, 'voiced', [{ ...captionsOnly('First line here.'), file: '0123456789abcdef.mp3' }]);
});
afterAll(() => fixture.cleanup());
afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe('cli', () => {
  it('checks video ids, including the reserved command names', () => {
    expect(checkId('demo-2', 'usage')).toBe('demo-2');
    expect(() => checkId(undefined, 'npm run x')).toThrow(/Missing video id\.\nUsage: npm run x/);
    expect(() => checkId('Demo', 'u')).toThrow(/"Demo" is not a video id/);
    expect(() => checkId('voices', 'u')).toThrow(/"voices" is the name of a command/);
  });

  it('names secret-like REMOTION_* variables, which Remotion would publish', () => {
    expect(exposedSecrets({ REMOTION_X: '1', REMOTION_API_KEY: 'a', REMOTION_SESSION_TOKEN: 'b', ELEVENLABS_API_KEY: 'c', OTHER_SECRET: 'd' })).toEqual([
      'REMOTION_API_KEY',
      'REMOTION_SESSION_TOKEN',
    ]);
    expect(exposedSecretsMessage({ REMOTION_X: '1' })).toBeNull();
    expect(exposedSecretsMessage({ REMOTION_DB_PASSWORD: 'x' })).toMatch(/^REMOTION_DB_PASSWORD would be copied into the Studio page/);
  });

  it('gives each run its own private, empty env file and removes it afterwards', () => {
    const a = privateEmptyEnvFile();
    const b = privateEmptyEnvFile();
    try {
      expect(a.file).not.toBe(b.file);
      expect(dirname(a.file)).not.toBe(dirname(b.file));
      expect(readFileSync(a.file, 'utf8')).toBe('');
      expect(statSync(dirname(a.file)).mode & 0o777).toBe(0o700);
      expect(statSync(a.file).mode & 0o777).toBe(0o600);
      // Created exclusively: writing it again with the same flag fails rather than following it.
      expect(() => writeFileSync(a.file, 'x', { flag: 'wx' })).toThrow(/EEXIST/);
    } finally {
      a.cleanup();
      b.cleanup();
    }
    expect(existsSync(dirname(a.file))).toBe(false);
    expect(existsSync(dirname(b.file))).toBe(false);
  });

  it('stops early on a secret-like REMOTION_* variable in the shell or .env, and finds a misplaced key', () => {
    const { root: r, cleanup } = tempRoot();
    try {
      expect(() => checkEnvFiles(r)).not.toThrow();
      expect(misplacedKey(r)).toBeUndefined();
      writeFileSync(join(r, '.env'), 'REMOTION_COLOR=blue\n');
      expect(() => checkEnvFiles(r)).not.toThrow();
      writeFileSync(join(r, '.env'), 'REMOTION_API_KEY=sk\n');
      expect(() => checkEnvFiles(r)).toThrow(/REMOTION_API_KEY would be copied into the Studio page[\s\S]*REMOTION_ prefix/);
      writeFileSync(join(r, '.env'), '');
      vi.stubEnv('REMOTION_SECRET', 'x');
      expect(() => checkEnvFiles(r)).toThrow(/REMOTION_SECRET would be copied/);
      vi.unstubAllEnvs();
      writeFileSync(join(r, '.env.local'), 'ELEVENLABS_API_KEY: sk\n');
      expect(misplacedKey(r)).toBe('.env.local');
    } finally {
      vi.unstubAllEnvs();
      cleanup();
    }
  });

  it('parses arguments in any order and rejects unknown flags', () => {
    const { positional, options } = parseArgs(['--a', 'x', '--v', 'val', 'y'], 'usage', ['--a'], ['--v']);
    expect(positional).toEqual(['x', 'y']);
    expect([...options]).toEqual([
      ['--a', true],
      ['--v', 'val'],
    ]);
    expect(() => parseArgs(['--b'], 'u')).toThrow(/Unknown option --b\.\nUsage: u/);
    expect(() => parseArgs(['--v'], 'u', [], ['--v'])).toThrow(/--v needs a value/);
    expect(() => parseArgs(['--v', '--a'], 'u', ['--a'], ['--v'])).toThrow(/--v needs a value/);
  });

  it('catches a kit flag that npm took for itself', () => {
    expect(() => parseArgs(['x'], 'npm run narrate -- <id>', ['--captions-only'], [], { npm_config_captions_only: 'true' })).toThrow(
      /npm took --captions-only as its own option, because it came before `--`[\s\S]*Put `--` before the kit's arguments/,
    );
    expect(() => parseArgs(['a', 'b'], 'u', [], ['--video'], { npm_config_video: 'x' })).toThrow(/npm took --video/);
    expect(parseArgs(['x'], 'u', ['--captions-only'], [], {}).positional).toEqual(['x']);
  });

  it('knows a test is not the entry script', () => {
    expect(isEntry(import.meta.url)).toBe(false);
  });

  it('prints errors with their next step and sets exit code 1', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await run(() => {
      throw new KitError('It broke.', 'Do this.');
    });
    expect(error).toHaveBeenCalledWith('Error: It broke.\nDo this.');
    expect(process.exitCode).toBe(1);
    await run(() => Promise.reject('plain'));
    expect(error).toHaveBeenLastCalledWith('Error: plain');
    process.exitCode = undefined;
    await run(() => undefined);
    expect(process.exitCode).toBeUndefined();
  });
});

describe('ff', () => {
  it('reads media lengths with the bundled ffprobe', () => {
    expect(seconds(tone)).toBeCloseTo(1, 1);
    expect(ffprobe(['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', tone])).toBe('audio');
    expect(ffmpeg(['-hide_banner', '-version']).stdout).toMatch(/^ffmpeg version/);
  });

  it('says to run npm ci when Remotion is not installed', () => {
    expect(() => remotionCli('/nonexistent')).toThrow(/Remotion is not installed[\s\S]*npm ci/);
  });

  it('explains a file ffmpeg cannot read, without stack frames', () => {
    const bogus = join(root, 'bogus.mp4');
    writeFileSync(bogus, 'not media');
    expect(() => seconds(bogus)).toThrow(/ffprobe failed: .*Invalid data[\s\S]*readable audio or video/);
    expect(() => seconds(bogus)).not.toThrow(/\n\s+at /);
  });

  it('keeps only the useful lines of a tool error', () => {
    expect(errorDetail("Error: Cannot find module 'x'\nRequire stack:\n- /a/b.js\n    at f (/a/c.js:1:1)\n")).toBe("Error: Cannot find module 'x'");
    expect(errorDetail('one\ntwo\nthree')).toBe('two three');
  });

  it('explains a missing platform binary', () => {
    const { root: r, cleanup } = tempRoot();
    try {
      rmSync(join(r, 'node_modules'));
      const cli = join(r, 'node_modules/@remotion/cli');
      mkdirSync(cli, { recursive: true });
      writeFileSync(join(cli, 'package.json'), JSON.stringify({ bin: { remotion: 'cli.js' } }));
      writeFileSync(join(cli, 'cli.js'), "console.error(\"Error: Cannot find module '@remotion/compositor-test'\\nRequire stack:\\n- /x\");\nprocess.exit(1);\n");
      expect(() => ffprobe(['x'], r)).toThrow(/ffprobe bundled with Remotion is missing[\s\S]*npm ci[\s\S]*--omit=optional/);
    } finally {
      cleanup();
    }
  });
});

describe('finish', () => {
  it('levels audio to -14 LUFS with a -2 dBTP ceiling and reports the measured result', () => {
    expect(TARGET).toBe('I=-14:TP=-2:LRA=11');
    const out = join(root, 'out/tone.mp4');
    const result = finish(tone, out);
    expect(result?.after.lufs).toBeCloseTo(-14, 0);
    expect(result?.after.peak).toBeLessThan(-1.5);
    expect(loudness(out)).toEqual(result?.after);
    expect(report(out, result)).toMatch(/audio leveled from -?\d+\.\d to -1[34]\.\d LUFS, true peak -\d\.\d dBTP/);
  });

  it('copies silence and picture-only files unchanged', () => {
    const quiet = join(root, 'out/quiet.wav');
    expect(finish(silence, quiet)).toBeNull();
    expect(readFileSync(quiet).equals(readFileSync(silence))).toBe(true);
    const still = join(root, 'out/still.png');
    expect(finish(join(ROOT, 'docs/review-sheet.png'), still)).toBeNull();
    expect(existsSync(still)).toBe(true);
    expect(report(still, null)).toMatch(/no audible track, copied unchanged/);
  });

  it('explains a missing input, an overwrite and an unreadable report', () => {
    expect(() => finish(join(root, 'none.mp4'), join(root, 'x.mp4'))).toThrow(/There is no file at[\s\S]*Render first/);
    expect(() => finish(tone, tone)).toThrow(/would overwrite the input/);
    expect(() => parseLoudnorm('no json here', 'f.mp4')).toThrow(/Could not measure the loudness of f\.mp4/);
  });

  it('runs from the command line, and needs --video or --force', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(() => finishMain([tone, join(root, 'out/cli.mp4')], root)).toThrow(/finish needs --video <id>[\s\S]*--force to level any file/);
    finishMain([tone, join(root, 'out/cli.mp4'), '--force'], root);
    expect(log.mock.calls[0][0]).toMatch(/audio leveled from/);
    expect(() => finishMain([tone], root)).toThrow(/Usage: npm run finish/);
    expect(() => finishMain([tone, 'a.mp4', 'b.mp4', '--force'], root)).toThrow(/Unexpected b\.mp4/);
  });

  it('leaves a captions-only video as rendered when told the video id', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const out = join(root, 'out/sfx-only.mp4');
    finishMain(['--video', 'demo', tone, out], root);
    expect(log.mock.calls[0][0]).toMatch(/"demo" has no narration, so the audio \(sound effects\) was left as rendered/);
    expect(readFileSync(out).equals(readFileSync(tone))).toBe(true);
    finishMain([tone, join(root, 'out/voiced.mp4'), '--video', 'voiced'], root);
    expect(log.mock.calls[1][0]).toMatch(/audio leveled from/);
    expect(() => finishMain([join(root, 'missing.mp4'), out, '--video', 'demo'], root)).toThrow(/There is no file at/);
  });
});

describe('srt', () => {
  it('writes cues that match the captions', () => {
    const out = join(root, 'out/captions/demo.srt');
    expect(writeSrt('demo', out, root)).toBe(3);
    expect(readFileSync(out, 'utf8')).toMatch(/^1\n00:00:00,200 --> 00:00:01,633\nFirst line here\.\n/);
  });

  it('explains missing and broken timing', () => {
    expect(() => readTiming('none', root)).toThrow(/There is no timing for "none"[\s\S]*--captions-only/);
    writeTiming(root, 'broken', '{ not json');
    expect(() => readTiming('broken', root)).toThrow(/has no lines[\s\S]*narrate -- broken --captions-only/);
  });

  it('runs from the command line', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    srtMain(['demo', join(root, 'out/cli.srt')], root);
    expect(log).toHaveBeenCalledWith(`${join(root, 'out/cli.srt')}: 3 cues`);
    expect(() => srtMain(['demo'], root)).toThrow(/Missing the output file/);
    expect(() => srtMain([], root)).toThrow(/Missing video id/);
    expect(() => srtMain(['demo', 'a.srt', 'b'], root)).toThrow(/Unexpected b/);
    expect(() => srtMain(['demo', 'a.srt', '--x'], root)).toThrow(/Unknown option --x/);
  });
});

describe('make', () => {
  // Stands in for the Remotion CLI: "renders" by copying a real audio file to the output.
  const fakeRemotion =
    (fail?: 'browser' | 'render'): Runner =>
    (args) => {
      if (args[0] === 'browser') return fail === 'browser' ? 1 : 0;
      if (fail === 'render') return 1;
      mkdirSync(join(root, 'out'), { recursive: true });
      copyFileSync(tone, args[3]);
      return 0;
    };

  it('renders, leaves captions-only audio as rendered, writes captions and removes the raw file', () => {
    const calls: string[][] = [];
    const runner: Runner = (args, r) => {
      calls.push(args);
      return fakeRemotion()(args, r);
    };
    const made = make('demo-wide', root, runner);
    expect(calls).toEqual([
      ['browser', 'ensure'],
      ['render', 'src/index.ts', 'demo-wide', join(root, 'out/demo-wide-raw.mp4'), '--codec=h264', '--crf=18'],
    ]);
    expect(made).toMatchObject({ video: join(root, 'out/demo-wide.mp4'), captions: join(root, 'out/demo-wide.srt'), cues: 3 });
    expect(made.audio).toMatch(/captions only, so the audio \(sound effects\) was left as rendered/);
    expect(readFileSync(made.video).equals(readFileSync(tone))).toBe(true);
    expect(existsSync(join(root, 'out/demo-wide-raw.mp4'))).toBe(false);
  });

  it('levels the audio when the video has narration', () => {
    expect(make('voiced', root, fakeRemotion()).audio).toMatch(/audio leveled from .* to -1[34]\.\d LUFS/);
  });

  it('asks for timing first and stops on a secret-like REMOTION_* variable in .env', () => {
    expect(() => make('other', root, fakeRemotion())).toThrow(/no timing for "other" yet[\s\S]*narrate -- other --captions-only/);
    writeFileSync(join(root, '.env'), 'REMOTION_API_KEY=sk\n');
    try {
      expect(() => make('demo', root, fakeRemotion())).toThrow(/REMOTION_API_KEY would be copied into the Studio page/);
    } finally {
      rmSync(join(root, '.env'));
    }
  });

  it('explains a Chrome download failure and a render failure', () => {
    expect(() => make('demo', root, fakeRemotion('browser'))).toThrow(/could not get ready to render; its error is above[\s\S]*Chrome Headless Shell[\s\S]*linux-dependencies/);
    expect(() => make('demo', root, fakeRemotion('render'))).toThrow(/could not render "demo"[\s\S]*remotion compositions/);
  });

  it('runs from the command line', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    makeMain(['demo'], root, fakeRemotion());
    expect(log.mock.calls[0][0]).toMatch(/left as rendered\n.*out\/demo\.mp4 \(\d+\.\d seconds\)\n.*out\/demo\.srt \(3 cues\)/);
    expect(() => makeMain(['demo', 'extra'], root, fakeRemotion())).toThrow(/Unexpected extra/);
    expect(() => makeMain(['demo', '--fast'], root, fakeRemotion())).toThrow(/Unknown option --fast/);
  });
});

describe('the launcher (scripts/run.mjs)', () => {
  // A copy of the kit in a folder whose name has a space, like many home folders.
  function kitCopy(withDeps: boolean) {
    const dir = join(mkdtempSync(join(tmpdir(), 'nvk run-')), 'my videos');
    for (const part of ['scripts', 'src', 'public', 'package.json', 'tsconfig.json', 'remotion.config.ts']) cpSync(join(ROOT, part), join(dir, part), { recursive: true });
    if (withDeps) symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'));
    return dir;
  }
  const launch = (dir: string, args: string[]) => spawnSync(process.execPath, [join(dir, 'scripts/run.mjs'), ...args], { cwd: dir, encoding: 'utf8' });

  it('runs a script from a path with a space', () => {
    const dir = kitCopy(true);
    try {
      const r = launch(dir, ['srt', 'explainer', 'out/explainer.srt']);
      expect(r.stderr).toBe('');
      expect(r.stdout).toMatch(/out\/explainer\.srt: \d+ cues/);
      expect(existsSync(join(dir, 'out/explainer.srt'))).toBe(true);
    } finally {
      rmSync(join(dir, '..'), { recursive: true, force: true });
    }
  });

  it('says to run npm ci when the dependencies are missing', () => {
    const dir = kitCopy(false);
    try {
      const r = launch(dir, ['make', 'explainer']);
      expect(r.status).toBe(1);
      expect(r.stderr).toBe('Error: the dependencies are not installed.\nRun `npm ci` in this folder first.\n');
    } finally {
      rmSync(join(dir, '..'), { recursive: true, force: true });
    }
  });

  it('refuses to start Remotion without its config', () => {
    const dir = kitCopy(true);
    try {
      rmSync(join(dir, 'remotion.config.ts'));
      const r = launch(dir, ['remotion', 'studio', 'src/index.ts']);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/remotion\.config\.ts is missing[\s\S]*git checkout -- remotion\.config\.ts/);
    } finally {
      rmSync(join(dir, '..'), { recursive: true, force: true });
    }
  });

  // A stand-in Remotion CLI that reports the signal it receives, then exits with code 7.
  it.each(['SIGTERM', 'SIGHUP', 'SIGINT'] as const)('passes %s on to the running tool and exits with its code', async (signal) => {
    const dir = kitCopy(false);
    try {
      const cli = join(dir, 'node_modules/@remotion/cli');
      mkdirSync(cli, { recursive: true });
      writeFileSync(join(cli, 'package.json'), JSON.stringify({ bin: { remotion: 'cli.js' } }));
      writeFileSync(
        join(cli, 'cli.js'),
        "for (const s of ['SIGTERM','SIGHUP','SIGINT']) process.on(s, () => { console.log('got ' + s); process.exit(7); });\nconsole.log('ready');\nsetInterval(() => {}, 1000);\n",
      );
      const child = spawn(process.execPath, [join(dir, 'scripts/run.mjs'), 'remotion', 'studio'], { cwd: dir });
      let out = '';
      child.stdout.on('data', (d: Buffer) => {
        out += d.toString();
        if (out.includes('ready')) child.kill(signal);
      });
      const code = await new Promise<number | null>((resolve) => child.on('exit', (c) => resolve(c)));
      expect(out).toContain(`got ${signal}`);
      expect(code).toBe(7);
    } finally {
      rmSync(join(dir, '..'), { recursive: true, force: true });
    }
  });
});
