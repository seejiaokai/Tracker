#!/usr/bin/env node
/* Build the standalone single-file app for review.
   Mirrors exportBakedHtml() in src/app/core.js: rewrites the OCU-BAKED block
   inside src/data/pristine.html with the current data modules, so the result
   opens in a browser with no server and no install.

   Usage: node scripts/build-standalone.mjs [outfile]
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { SYLLABI, SYL_NAMES, DEFAULT_SYL_NAME, DEFAULT_SYL_ORDER } = await import(resolve(root, 'src/data/syllabi.js'));
const { DEFAULT_LAYOUTS } = await import(resolve(root, 'src/data/layouts.js'));
const { EVENT_INFO } = await import(resolve(root, 'src/data/eventInfo.js'));
const { SEED_STATE, SEED_STAMP } = await import(resolve(root, 'src/data/seedState.js'));

const j = (v) => JSON.stringify(v);
const B = 'OCU-' + 'BAKED';
const block =
  `/*==${B}:BEGIN==*/\n` +
  `const SYLLABI = ${j(SYLLABI)};\n` +
  `const DEFAULT_LAYOUTS = ${j(DEFAULT_LAYOUTS)};\n` +
  `const SYL_NAMES = Object.keys(SYLLABI);\n` +
  `const DEFAULT_SYL_NAME = ${j(DEFAULT_SYL_NAME)};\n` +
  `const DEFAULT_SYL_ORDER = ${j(DEFAULT_SYL_ORDER)};\n` +
  `const EVENT_INFO=${j(EVENT_INFO)};\n` +
  `/* Course/student data captured at export time; seeded into storage on first run. */\n` +
  `const SEED_STATE = ${j(SEED_STATE)};\n` +
  `const SEED_STAMP = ${j(SEED_STAMP)};\n` +
  `/*==${B}:END==*/`;

const src = readFileSync(resolve(root, 'src/data/pristine.html'), 'utf8');
const re = new RegExp(`/\\*==${B}:BEGIN==\\*/[\\s\\S]*?/\\*==${B}:END==\\*/`);
if (!re.test(src)) { console.error('baked block not found in pristine.html'); process.exit(1); }

const out = process.argv[2] || resolve(root, 'OCU-Tracker-review.html');
writeFileSync(out, src.replace(re, () => block));
console.log(`${out}  (${(readFileSync(out).length / 1024).toFixed(0)} KB, ${SYL_NAMES.length} syllabi)`);
