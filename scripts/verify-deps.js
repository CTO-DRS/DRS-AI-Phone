#!/usr/bin/env node
/**
 * Dependency drift guard — fail fast in CI before any build/test step.
 *
 * Categories:
 *  MUST_BE_PINNED  — packages whose JS manifest version must be EXACT (no ^ / ~).
 *                    Why: onnxruntime-react-native ships native binaries whose
 *                    ABI must match the patched pod / Android prebuilt; a caret
 *                    range lets a lockfile refresh silently move the JS layer
 *                    against a pinned native artifact (the v1.41.0 drift:
 *                    manifest ^1.23.2 vs lockfile 1.24.3).
 *
 *  MUST_BE_ALIGNED — families that must share the same MAJOR across the
 *                    manifest. Why: babel-jest@30 against jest@29 silently
 *                    breaks the RN preset (observed: 21 suites die under
 *                    jest-haste / babel transforms).
 *
 * Exit codes: 0 = all guards pass, 1 = any violation (CI fail-fast).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const allDeps = {...pkg.dependencies, ...pkg.devDependencies};

// ── Guard configuration ────────────────────────────────────────────────
const MUST_BE_PINNED = [
  'onnxruntime-react-native',
];

const MUST_BE_ALIGNED = [
  ['jest', 'babel-jest', '@types/jest'],
];
// ───────────────────────────────────────────────────────────────────────

let failed = false;

for (const name of MUST_BE_PINNED) {
  const spec = allDeps[name];
  if (spec === undefined) {
    console.error(`[verify-deps] MUST_BE_PINNED: "${name}" not found in package.json`);
    failed = true;
    continue;
  }
  if (/^[~^]/.test(spec)) {
    console.error(
      `[verify-deps] MUST_BE_PINNED: "${name}" is "${spec}" — must be an exact ` +
      `version (no ^ / ~). Native ABI drift guard.`,
    );
    failed = true;
  } else {
    console.log(`[verify-deps] OK pinned: ${name}@${spec}`);
  }
}

for (const family of MUST_BE_ALIGNED) {
  const majors = [];
  for (const name of family) {
    const spec = allDeps[name];
    if (spec === undefined) {
      console.error(`[verify-deps] MUST_BE_ALIGNED: "${name}" not found in package.json`);
      failed = true;
      majors.push(null);
      continue;
    }
    const m = spec.match(/\d+/);
    majors.push(m ? Number(m[0]) : null);
  }
  const distinct = new Set(majors.filter(v => v !== null));
  if (distinct.size > 1) {
    console.error(
      `[verify-deps] MUST_BE_ALIGNED: family [${family.join(', ')}] spans majors ` +
      `[${family.map((n, i) => `${n}=${majors[i]}`).join(', ')}] — align them on the ` +
      `same major (RN preset breaks on jest-family drift).`,
    );
    failed = true;
  } else if (distinct.size === 1) {
    console.log(
      `[verify-deps] OK aligned: [${family.join(', ')}] on major ${[...distinct][0]}`,
    );
  }
}

if (failed) {
  console.error('[verify-deps] FAILED — see violations above.');
  process.exit(1);
}
console.log('[verify-deps] All dependency guards passed.');
