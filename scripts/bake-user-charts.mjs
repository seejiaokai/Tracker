/* Bake the charts half of a user's saved file into src/data/*.js.
 *
 *   node scripts/bake-user-charts.mjs <file.json>
 *
 * Reads ONLY `charts` — never `students`, so a WITH-STUDENTS file can be used
 * without a name, mark or date ever reaching the repository (it re-reads the
 * file and asserts that afterwards).
 *
 * Two deliberate exceptions to "take the file verbatim":
 *  - a syllabus the file does not carry is LEFT baked, never deleted. Absence
 *    in one save is not an instruction to destroy a chart.
 *  - an eventInfo entry equal to the active syllabus's own profile
 *    (EVENT_INFO_BY_SYL) is dropped. Editing any row while a renumbered
 *    syllabus is on screen used to save that syllabus's wording globally; those
 *    entries are that leak, not a global edit. src/app/core.js now prevents it.
 */
import fs from 'fs';
import path from 'path';
import url from 'url';

const root = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));
const src = process.argv[2];
if (!src) { console.error('usage: bake-user-charts.mjs <file.json>'); process.exit(1); }

const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
if (raw.format !== 'ocu-tracker') throw new Error('not an OCU Tracker file');
const charts = raw.charts;
if (!charts || !Array.isArray(charts.order)) throw new Error('file carries no charts');

const { SYLLABI } = await import(path.join(root, 'src/data/syllabi.js'));
const { DEFAULT_LAYOUTS } = await import(path.join(root, 'src/data/layouts.js'));
const { EVENT_INFO, EVENT_INFO_BY_SYL } = await import(path.join(root, 'src/data/eventInfo.js'));

/* ---- syllabi + layouts: the file wins for what it carries ---- */
const outSyl = JSON.parse(JSON.stringify(SYLLABI));
const outLay = JSON.parse(JSON.stringify(DEFAULT_LAYOUTS));
const kept = [];
for (const n of charts.order) {
  if (!charts.syllabi[n]) continue;
  outSyl[n] = charts.syllabi[n];
  if (charts.layouts[n]) outLay[n] = charts.layouts[n];
  kept.push(n);
}
const untouched = Object.keys(SYLLABI).filter(n => !kept.includes(n));

/* ---- eventInfo: apply real edits, drop the per-syllabus leak ---- */
const outInfo = JSON.parse(JSON.stringify(EVENT_INFO));
const changed = [], skipped = [];
for (const [id, val] of Object.entries(charts.eventInfo || {})) {
  const base = EVENT_INFO[id] || {};
  if (JSON.stringify(base) === JSON.stringify(val)) continue;
  const leak = Object.values(EVENT_INFO_BY_SYL).some(block => {
    const p = block[id]; if (!p) return false;
    return Object.keys(p).every(f => (val[f] || '') === (p[f] || ''));
  });
  if (leak) { skipped.push(id); continue; }
  outInfo[id] = val; changed.push(id);
}

/* ---- every event must have a position, or it lands at 60,60 ---- */
for (const n of kept) {
  const miss = outSyl[n].map(e => e.id).filter(id => typeof outLay[n]?.[id]?.x !== 'number');
  if (miss.length) throw new Error(`${n}: ${miss.length} events with no position: ${miss.slice(0, 6).join(', ')}`);
}

/* ---- write ---- */
/* Each blob is one single line (see CLAUDE.md), so replace that line and leave
   every other export and comment in the file alone. An earlier regex version
   spanned from one export to the next and deleted EVENT_INFO_BY_SYL. */
const put = (file, decl, value) => {
  const p = path.join(root, file);
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  const head = new RegExp(`^export const ${decl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);
  const hits = lines.map((l, i) => (head.test(l) ? i : -1)).filter(i => i >= 0);
  if (hits.length !== 1) throw new Error(`${file}: expected 1 line declaring ${decl}, found ${hits.length}`);
  lines[hits[0]] = `export const ${decl}=` + JSON.stringify(value) + ';';
  fs.writeFileSync(p, lines.join('\n'));
};
put('src/data/syllabi.js', 'SYLLABI', outSyl);
put('src/data/layouts.js', 'DEFAULT_LAYOUTS', outLay);
put('src/data/eventInfo.js', 'EVENT_INFO', outInfo);

/* ---- prove no person reached the repo ---- */
const students = raw.students;
if (students) {
  const names = new Set();
  for (const c of Object.values(students.byCourse || {}))
    for (const s of Object.values(c.bySyllabus || {})) (s.roster || []).forEach(n => names.add(n));
  const written = ['src/data/syllabi.js', 'src/data/layouts.js', 'src/data/eventInfo.js']
    .map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  const leaked = [...names].filter(n => n && written.includes(n));
  if (leaked.length) throw new Error('STUDENT NAME REACHED THE REPO: ' + leaked.join(', '));
  console.log(`checked: none of the ${names.size} student names in the file reached src/data`);
}

console.log('baked charts:', kept.join(' · '));
console.log('left untouched (absent from the file):', untouched.join(' · ') || 'none');
console.log('eventInfo updated:', changed.join(', ') || 'none');
console.log('eventInfo skipped as per-syllabus leak:', skipped.join(', ') || 'none');
