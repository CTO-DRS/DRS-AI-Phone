#!/usr/bin/env node
/**
 * ARCH-01/CODE-02 ratchet gate for circular imports.
 *
 * The audit found 42 circular dependency chains across src/ (barrels
 * components/index.ts and utils/index.ts, utils ⇄ store, store → hooks,
 * …). Breaking all of them is a multi-release refactor; what must never
 * happen in the meantime is the count going UP.
 *
 * This script fails CI when the number of cycles reported by madge
 * exceeds CIRCULAR_IMPORT_BASELINE. Whenever you break cycles, lower
 * the baseline in the same commit — the gate then protects the new,
 * smaller number. The end state required by the audit is 0.
 *
 * Run locally: yarn check:circles
 */

const {execFileSync} = require('child_process');
const path = require('path');

// Baseline history:
//   2026-10-28: 42 → 41 (errors-core / errors-ui split, cycle buster)
//   2026-10-30: 41 → 40 (DetailsView moved screens/ → components/, a
//              component now imports a component, not a screen)
// Lower it as cycles get broken; never raise it.
const CIRCULAR_IMPORT_BASELINE = 40;

const repoRoot = path.resolve(__dirname, '..');

let stdout = '';
try {
  stdout = execFileSync(
    'yarn',
    [
      '--silent',
      'madge',
      '--circular',
      '--extensions',
      'ts,tsx',
      '--ts-config',
      'tsconfig.json',
      'src/',
    ],
    {cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']},
  );
} catch (err) {
  // madge 8 exits non-zero whenever circular dependencies are FOUND —
  // that is a valid, parseable outcome, not a tool failure. Keep the
  // output and fall through to the parsing below; a genuinely broken
  // run (bad config, missing files) produces unparseable output and is
  // rejected by the parse guard.
  stdout = `${err.stdout || ''}${err.stderr || ''}`;
}

const match = stdout.match(/Found (\d+) circular dependenc(?:y|ies)!/);
const count = match ? parseInt(match[1], 10) : 0;

if (!match && !/No circular dependencies found!/i.test(stdout)) {
  console.error(
    '::error::Could not parse madge output — refusing to pass the gate blindly. Output:',
  );
  console.error(stdout);
  process.exit(1);
}

console.log(
  `Circular import chains: ${count} (baseline: ${CIRCULAR_IMPORT_BASELINE})`,
);

if (count > CIRCULAR_IMPORT_BASELINE) {
  console.error(
    `::error::Circular imports increased: ${count} > ${CIRCULAR_IMPORT_BASELINE}. ` +
      'A new import cycle was introduced — the full madge chain list follows; ' +
      'find the chain you added and break it. If cycles were restructured, lower ' +
      'the baseline instead of raising it.',
  );
  console.error(stdout);
  process.exit(1);
}

if (count < CIRCULAR_IMPORT_BASELINE) {
  console.log(
    `Nice — cycles dropped below the baseline (${count} < ${CIRCULAR_IMPORT_BASELINE}). ` +
      'Lower CIRCULAR_IMPORT_BASELINE in scripts/check-circular-imports.js in this same commit so the gate protects the win.',
  );
}

if (count === 0) {
  console.log('Zero circular imports — ARCH-01/CODE-02 end state reached.');
}
process.exit(0);
