import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { classify, licenseOf, main, permissive, scan, weakCopyleft } from '../scripts/check-licenses.ts';
import { tempRoot } from './helpers.ts';

describe('licence check', () => {
  it('reads the licence field in its old and new shapes', () => {
    expect(licenseOf({ license: 'MIT' })).toBe('MIT');
    expect(licenseOf({ license: { type: 'ISC' } })).toBe('ISC');
    expect(licenseOf({ licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }] })).toBe('MIT OR Apache-2.0');
    expect(licenseOf({})).toBe('');
  });

  it('accepts an expression with one fully permissive alternative', () => {
    expect(permissive('MIT')).toBe(true);
    expect(permissive('(MIT OR GPL-3.0-or-later)')).toBe(true);
    expect(permissive('MIT AND GPL-2.0-only')).toBe(false);
    expect(permissive('GPL-3.0-only')).toBe(false);
    expect(permissive('SEE LICENSE IN LICENSE.md')).toBe(false);
  });

  it('treats MPL and LGPL as weak copyleft, not permissive', () => {
    expect(permissive('MPL-2.0')).toBe(false);
    expect(weakCopyleft('MPL-2.0')).toBe(true);
    expect(weakCopyleft('LGPL-3.0-or-later')).toBe(true);
    expect(weakCopyleft('MIT')).toBe(false);
    expect(weakCopyleft('GPL-3.0-only')).toBe(false);
  });

  it('names Remotion packages and flags copyleft or unknown licences', () => {
    const packages = new Map([
      ['react@19.3.1', 'MIT'],
      ['remotion@4.0.540', 'SEE LICENSE IN LICENSE.md'],
      ['@remotion/cli@4.0.540', ''],
      ['left-pad@1.0.0', 'GPL-3.0-only'],
      ['mystery@1.0.0', ''],
      ['mediabunny@1.0.0', 'MPL-2.0'],
    ]);
    const { counts, remotion, weak, review } = classify(packages);
    expect(remotion).toEqual(['remotion@4.0.540', '@remotion/cli@4.0.540']);
    expect(weak).toEqual(['mediabunny@1.0.0: MPL-2.0']);
    expect(review).toEqual(['left-pad@1.0.0: GPL-3.0-only', 'mystery@1.0.0: no licence field']);
    expect(counts.get('none')).toBe(2);
  });

  it('walks scoped and nested packages', () => {
    const { root, cleanup } = tempRoot();
    try {
      const nm = join(root, 'deps');
      const write = (dir: string, pkg: object) => {
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
      };
      write(join(nm, 'a'), { name: 'a', version: '1.0.0', license: 'MIT' });
      write(join(nm, '@s/b'), { name: '@s/b', version: '2.0.0', license: 'ISC' });
      write(join(nm, 'a/node_modules/c'), { name: 'c', version: '3.0.0', license: 'Apache-2.0' });
      mkdirSync(join(nm, 'not-a-package'));
      mkdirSync(join(nm, '.cache'));
      expect([...scan(nm)]).toEqual([
        ['@s/b@2.0.0', 'ISC'],
        ['a@1.0.0', 'MIT'],
        ['c@3.0.0', 'Apache-2.0'],
      ]);
      expect(scan(join(root, 'missing')).size).toBe(0);
    } finally {
      cleanup();
    }
  });

  it('passes on this repository and fails when a package needs review', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(main()).toBe(true);
    const { root, cleanup } = tempRoot();
    try {
      const fake = join(root, 'fake');
      mkdirSync(join(fake, 'node_modules/gpl'), { recursive: true });
      writeFileSync(join(fake, 'node_modules/gpl/package.json'), JSON.stringify({ name: 'gpl', version: '1.0.0', license: 'GPL-3.0-only' }));
      expect(main(fake)).toBe(false);
      expect(error.mock.calls[0][0]).toContain('gpl@1.0.0: GPL-3.0-only');
    } finally {
      cleanup();
    }
  });
});
