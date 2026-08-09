/* How the Show All list is ordered and filtered.
 *
 * No browser APIs and no core.js import, so scripts/smoke.mjs exercises this
 * in plain Node — the same arrangement fileFormat.js uses.
 *
 * Events are grouped by the code in front of the dash (ST, ACG, TR(S), SA(S))
 * and ordered by number inside each group, so ST-01..ST-18 read in order and
 * typing "ST" brings back that whole family.
 */

/* "ST-10 ACM" -> "ST"; "TR(S)-LAO" -> "TR(S)"; "IEPE/IPC" (no dash) -> itself */
export function categoryOf(id) {
  const s = String(id == null ? '' : id);
  const i = s.indexOf('-');
  return i > 0 ? s.slice(0, i) : s;
}

/* Digits compare as numbers so ST-9 sorts before ST-10, not after it. */
function chunks(s) {
  return String(s).match(/\d+|\D+/g) || [];
}
export function compareIds(a, b) {
  const A = chunks(a), B = chunks(b);
  for (let i = 0; i < Math.min(A.length, B.length); i++) {
    const x = A[i], y = B[i];
    const nx = /^\d/.test(x), ny = /^\d/.test(y);
    if (nx && ny) { const d = parseInt(x, 10) - parseInt(y, 10); if (d) return d; }
    else if (x !== y) return x < y ? -1 : 1;
  }
  return A.length - B.length;
}

/* Groups in course order — the category whose first event comes soonest leads,
   which puts ST before ACG exactly as the syllabus does. */
export function groupByCategory(events) {
  const order = [], byCat = {};
  (events || []).forEach((e, i) => {
    const c = categoryOf(e.id);
    if (!byCat[c]) { byCat[c] = { cat: c, events: [], at: (e.seq != null ? e.seq : i) }; order.push(byCat[c]); }
    const at = (e.seq != null ? e.seq : i);
    if (at < byCat[c].at) byCat[c].at = at;
    byCat[c].events.push(e);
  });
  order.sort((a, b) => a.at - b.at);
  order.forEach(g => g.events.sort((x, y) => compareIds(x.id, y.id)));
  return order;
}

/* Typing a code shows that family and nothing else: if anything starts with
   what was typed, only those come back, so "ST" cannot be diluted by every
   event whose crew or name happens to contain the letters. Searches that match
   no code ("night", "IP / UW") still search the whole row. */
export function filterEvents(events, query, textOf) {
  const q = String(query == null ? '' : query).trim().toLowerCase();
  if (!q) return (events || []).slice();
  const byPrefix = (events || []).filter(e => String(e.id).toLowerCase().startsWith(q));
  if (byPrefix.length) return byPrefix;
  return (events || []).filter(e => String(textOf ? textOf(e) : e.id).toLowerCase().includes(q));
}
