// Lists the licence of every installed package and fails on strong copyleft (GPL, AGPL,
// SSPL) or on any package whose licence it cannot classify. Weak copyleft (MPL, LGPL) is
// allowed for unmodified dependencies and listed by name. Remotion's packages are
// source-available under the Remotion License; they are named, not failed, because the
// README states that licence plainly.
//   npm run check:licenses
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, isEntry, run } from './cli.ts';

type Pkg = { name?: string; version?: string; license?: string | { type?: string }; licenses?: { type?: string }[] };

const PERMISSIVE = /^(MIT|MIT-0|ISC|0BSD|BSD-2-Clause|BSD-3-Clause|Apache-2\.0|BlueOak-1\.0\.0|CC0-1\.0|CC-BY-4\.0|Unlicense|Python-2\.0|WTFPL)$/;
const WEAK = /^(MPL-2\.0|LGPL-[23]\.[01](-only|-or-later)?)$/;
const REMOTION = /^(remotion|@remotion\/.+)$/;

/** The licence string of a package.json, from `license` or the older `licenses` array. */
export function licenseOf(pkg: Pkg): string {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  return pkg.licenses?.map((l) => l.type).join(' OR ') ?? '';
}

// True when one OR alternative of an SPDX expression is made only of licences `ok` accepts.
const anyAlternative = (expr: string, ok: (id: string) => boolean) =>
  expr
    .replace(/[()]/g, '')
    .split(/\s+OR\s+/)
    .some((alt) => alt.split(/\s+AND\s+/).every((id) => ok(id.trim())));

/** True when one OR alternative of an SPDX expression is made only of permissive licences. */
export const permissive = (expr: string): boolean => anyAlternative(expr, (id) => PERMISSIVE.test(id));

/** True when one OR alternative uses only permissive or weak-copyleft (MPL, LGPL) licences. */
export const weakCopyleft = (expr: string): boolean => !permissive(expr) && anyAlternative(expr, (id) => PERMISSIVE.test(id) || WEAK.test(id));

/** Every installed package as `name@version` mapped to its licence. */
export function scan(dir: string, seen = new Map<string, string>()): Map<string, string> {
  if (!existsSync(dir)) return seen;
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const path = join(dir, entry);
    if (entry.startsWith('@')) {
      scan(path, seen);
      continue;
    }
    const file = join(path, 'package.json');
    if (!existsSync(file)) continue;
    const pkg = JSON.parse(readFileSync(file, 'utf8')) as Pkg;
    if (pkg.name && pkg.version) seen.set(`${pkg.name}@${pkg.version}`, licenseOf(pkg));
    scan(join(path, 'node_modules'), seen);
  }
  return seen;
}

/** Sorts packages into licence counts, Remotion's packages, weak copyleft and those needing review. */
export function classify(packages: Map<string, string>) {
  const counts = new Map<string, number>();
  const remotion: string[] = [];
  const weak: string[] = [];
  const review: string[] = [];
  for (const [id, license] of packages) {
    const name = id.slice(0, id.lastIndexOf('@'));
    if (REMOTION.test(name) && !permissive(license)) remotion.push(id);
    else if (weakCopyleft(license)) weak.push(`${id}: ${license}`);
    else if (!permissive(license)) review.push(`${id}: ${license || 'no licence field'}`);
    counts.set(license || 'none', (counts.get(license || 'none') ?? 0) + 1);
  }
  return { counts, remotion, weak, review };
}

/** Prints the report and returns false when any package needs review. */
export function main(root = ROOT): boolean {
  const packages = scan(join(root, 'node_modules'));
  const { counts, remotion, weak, review } = classify(packages);
  console.log(`${packages.size} packages`);
  for (const [license, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${license}`);
  console.log(`Remotion License (source-available, see README): ${remotion.length} packages`);
  console.log(`Weak copyleft, used unmodified: ${weak.length ? weak.join(', ') : 'none'}`);
  if (review.length) console.error(`Needs review (${review.length}):\n  ${review.join('\n  ')}`);
  else console.log('No strong copyleft or unclassified licences.');
  return review.length === 0;
}

if (isEntry(import.meta.url)) {
  await run(() => {
    if (!main()) process.exitCode = 1;
  });
}
