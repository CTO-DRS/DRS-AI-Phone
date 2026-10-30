#!/usr/bin/env node
/**
 * DEP-05: structural consistency gate for the vendored TTS package
 * (@drsai/react-native-speech, vendors/react-native-speech).
 *
 * The package is consumed via file: and therefore sits outside Dependabot
 * and outside every lockfile. Its lib/ output is prebuilt and committed;
 * nothing in CI regenerates it, so src↔lib drift would otherwise be
 * trusted rather than verified.
 *
 * This gate verifies the structural mirror:
 *   every src TypeScript file (excluding tests/mocks)
 *     -> lib/module/<same path>.js
 *     -> lib/typescript/src/<same path>.d.ts
 * and rejects lib/ artifacts with no source counterpart (orphaned
 * builds). It is structural on purpose: a byte-level rebuild gate lives
 * in the weekly vendors-audit workflow, which installs the vendored
 * toolchain and diffs `bob build` output against the committed lib/.
 *
 * Usage: node scripts/check-vendors-consistency.mjs [--vendors <dir>]
 * Exit codes: 0 = consistent, 1 = drift or structural problems.
 */

import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {join, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {dirname} from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');

const args = process.argv.slice(2);
let vendorsDir = join(repoRoot, 'vendors');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--vendors' && args[i + 1]) {
    vendorsDir = args[i + 1];
    i++;
  }
}

const pkgDir = join(vendorsDir, 'react-native-speech');
const errors = [];
const notes = [];

function fail(message) {
  errors.push(message);
}

function walk(dir, predicate, acc = []) {
  if (!existsSync(dir)) {
    return acc;
  }
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, predicate, acc);
    } else if (predicate(full)) {
      acc.push(full);
    }
  }
  return acc;
}

// ---------------------------------------------------------------------------
// 0. Package presence + metadata
// ---------------------------------------------------------------------------
if (!existsSync(pkgDir)) {
  console.error(`::error::vendored package missing: ${relative(repoRoot, pkgDir)}`);
  process.exit(1);
}

const pkgJsonPath = join(pkgDir, 'package.json');
if (!existsSync(pkgJsonPath)) {
  fail('vendors/react-native-speech/package.json is missing');
} else {
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  if (pkg.name !== '@drsai/react-native-speech') {
    fail(`unexpected vendored package name: ${pkg.name}`);
  } else {
    notes.push(`package: ${pkg.name}@${pkg.version}`);
  }
  const runtimeDeps = Object.keys(pkg.dependencies || {});
  notes.push(
    runtimeDeps.length
      ? `runtime deps (resolved through the ROOT yarn.lock): ${runtimeDeps.join(', ')}`
      : 'runtime deps: none',
  );
}

// ---------------------------------------------------------------------------
// 1. Source inventory (tests, mocks and fixtures excluded from lib/)
// ---------------------------------------------------------------------------
const isTestPath = p => p.includes(`${sep}__tests__${sep}`) || /\.(test|spec)\.[jt]sx?$/.test(p);

const sources = walk(join(pkgDir, 'src'), p => /\.(ts|tsx)$/.test(p)).filter(
  p => !isTestPath(p),
);

if (sources.length === 0) {
  fail('no TypeScript sources found under vendors/react-native-speech/src');
}

// ---------------------------------------------------------------------------
// 2. Mirror check: src -> lib/module + lib/typescript
// ---------------------------------------------------------------------------
let mirrored = 0;
for (const srcFile of sources) {
  const rel = relative(join(pkgDir, 'src'), srcFile).replace(/\\/g, '/');
  const stem = rel.replace(/\.(ts|tsx)$/, '');

  const moduleArtifact = join(pkgDir, 'lib', 'module', `${stem}.js`);
  const declArtifact = join(pkgDir, 'lib', 'typescript', 'src', `${stem}.d.ts`);

  if (!existsSync(moduleArtifact)) {
    fail(`missing lib/module/${stem}.js (stale or unbuilt source: src/${rel})`);
  } else if (statSync(moduleArtifact).size === 0) {
    fail(`empty lib/module/${stem}.js (unusable prebuilt output)`);
  } else {
    mirrored++;
  }

  if (!existsSync(declArtifact)) {
    fail(
      `missing lib/typescript/src/${stem}.d.ts (stale or unbuilt source: src/${rel})`,
    );
  } else if (statSync(declArtifact).size === 0) {
    fail(`empty lib/typescript/src/${stem}.d.ts`);
  }
}

// ---------------------------------------------------------------------------
// 3. Orphan check: lib artifacts without a source counterpart
// ---------------------------------------------------------------------------
const sourceStems = new Set(
  sources.map(f => relative(join(pkgDir, 'src'), f).replace(/\\/g, '/').replace(/\.(ts|tsx)$/, '')),
);

for (const js of walk(join(pkgDir, 'lib', 'module'), p => p.endsWith('.js'))) {
  const rel = relative(join(pkgDir, 'lib', 'module'), js)
    .replace(/\\/g, '/')
    .replace(/\.js$/, '');
  if (!sourceStems.has(rel)) {
    fail(`orphaned build artifact (no source): lib/module/${rel}.js`);
  }
}
for (const dts of walk(
  join(pkgDir, 'lib', 'typescript'),
  p => p.endsWith('.d.ts'),
)) {
  const rel = relative(join(pkgDir, 'lib', 'typescript', 'src'), dts)
    .replace(/\\/g, '/')
    .replace(/\.d\.ts$/, '');
  // Guard against paths escaping the nested src/ root.
  if (rel.startsWith('..')) {
    fail(`unexpected artifact outside lib/typescript/src: ${dts}`);
    continue;
  }
  if (!sourceStems.has(rel)) {
    fail(`orphaned declaration (no source): lib/typescript/src/${rel}.d.ts`);
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
for (const note of notes) {
  console.log(note);
}
console.log(
  `src↔lib mirror: ${mirrored}/${sources.length} sources mirrored into lib/module and lib/typescript`,
);

if (errors.length > 0) {
  console.error('');
  for (const error of errors) {
    console.error(`::error::${error}`);
  }
  console.error('');
  console.error(
    'The vendored package is outside Dependabot and lockfiles (DEP-05); ' +
      'this gate is what keeps src/ and the committed prebuilt lib/ from ' +
      'silently drifting apart. Fix by rebuilding the package ' +
      '(cd vendors/react-native-speech && yarn && yarn prepare) and ' +
      'committing the refreshed lib/ together with the src/ change.',
  );
  process.exit(1);
}

console.log('OK: vendored package src↔lib structure is consistent.');
