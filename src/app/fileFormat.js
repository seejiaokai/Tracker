/* One JSON file holding the user's syllabus work. Deliberately free of browser
   APIs and of core.js, so it can be imported and checked in plain Node.

   Shapes (fixed here so every caller agrees):
     charts   = { order: string[], syllabi: {name: event[]},
                  layouts: {name: object}, eventInfo: object }
     students = { courses: string[],
                  byCourse: {course: {plan: object, bySyllabus: {syl: {
                    roster: string[], marks: {student: object},
                    dates: {student: object} }}}} }

   Nested objects rather than joined key strings on purpose: course, syllabus
   and student names are free text and may contain any separator character.

   See docs/superpowers/specs/2026-08-07-syllabus-file-design.md */
export const FILE_FORMAT = 'ocu-tracker';
export const FILE_VERSION = 1;

export function buildFile({ charts = null, students = null, savedAt }) {
  const out = {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    savedAt: savedAt || null,
    contains: { charts: !!charts, students: !!students },
  };
  if (charts) out.charts = charts;
  if (students) out.students = students;
  return out;
}

/* Checking the SHAPE, not just the label. The envelope test below says a file
   came from this app; it says nothing about what is inside. A file that says
   ocu-tracker but holds, say, a roster that is not a list gets written to
   storage before anything notices, and from then on the app opens to a blank
   page on every load with no button left to press — recoverable only by
   clearing the browser's data, which is not a thing a user can be asked to do.
   So every block is checked here, before a single key is written.
   Errors name the part that is wrong, because "that file is broken" leaves
   nobody any wiser. */
const isPlainObject = v => !!v && typeof v === 'object' && !Array.isArray(v);

function checkCharts(c) {
  if (!isPlainObject(c)) throw new Error('The charts in that file are damaged, so it has not been opened.');
  if (c.order != null && (!Array.isArray(c.order) || c.order.some(n => typeof n !== 'string')))
    throw new Error('The list of chart names in that file is damaged, so it has not been opened.');
  if (c.syllabi != null && !isPlainObject(c.syllabi))
    throw new Error('The charts in that file are damaged, so it has not been opened.');
  if (c.layouts != null && !isPlainObject(c.layouts))
    throw new Error('The chart positions in that file are damaged, so it has not been opened.');
  if (c.eventInfo != null && !isPlainObject(c.eventInfo))
    throw new Error('The event details in that file are damaged, so it has not been opened.');
  for (const [name, events] of Object.entries(c.syllabi || {})) {
    if (!Array.isArray(events))
      throw new Error('The “' + name + '” chart in that file is damaged, so it has not been opened.');
    for (const e of events) {
      if (!isPlainObject(e) || typeof e.id !== 'string' || !e.id)
        throw new Error('The “' + name + '” chart in that file has an event with no name, so it has not been opened.');
      if (e.prereqs != null && (!Array.isArray(e.prereqs) || e.prereqs.some(p => typeof p !== 'string')))
        throw new Error('The “' + name + '” chart in that file lists a bad prerequisite on ' + e.id + ', so it has not been opened.');
    }
    const bad = firstCycle(events);
    if (bad) throw new Error('The “' + name + '” chart in that file runs in a circle (' + bad + '), so it has not been opened.');
  }
}

/* A prerequisite loop makes the chart's own level-finder recurse until the
   stack gives out, which kills every later render. Cheaper to refuse the file. */
export function firstCycle(events) {
  const by = {}; (events || []).forEach(e => { if (e && e.id) by[e.id] = e; });
  const state = {};   /* 1 = being visited, 2 = finished */
  const walk = (id, trail) => {
    if (state[id] === 2) return null;
    if (state[id] === 1) return trail.slice(trail.indexOf(id)).concat(id).join(' → ');
    state[id] = 1;
    for (const p of (by[id].prereqs || [])) {
      if (!by[p]) continue;
      const hit = walk(p, trail.concat(id));
      if (hit) return hit;
    }
    state[id] = 2;
    return null;
  };
  for (const id of Object.keys(by)) { const hit = walk(id, []); if (hit) return hit; }
  return null;
}

function checkStudents(s) {
  if (!isPlainObject(s)) throw new Error('The people in that file are damaged, so it has not been opened.');
  if (s.courses != null && (!Array.isArray(s.courses) || s.courses.some(n => typeof n !== 'string')))
    throw new Error('The list of courses in that file is damaged, so it has not been opened.');
  if (s.byCourse != null && !isPlainObject(s.byCourse))
    throw new Error('The courses in that file are damaged, so it has not been opened.');
  for (const [course, cv] of Object.entries(s.byCourse || {})) {
    if (!isPlainObject(cv))
      throw new Error('Course “' + course + '” in that file is damaged, so it has not been opened.');
    if (cv.bySyllabus != null && !isPlainObject(cv.bySyllabus))
      throw new Error('Course “' + course + '” in that file is damaged, so it has not been opened.');
    for (const [syl, sv] of Object.entries(cv.bySyllabus || {})) {
      if (!isPlainObject(sv))
        throw new Error('“' + syl + '” on course “' + course + '” in that file is damaged, so it has not been opened.');
      if (sv.roster != null && (!Array.isArray(sv.roster) || sv.roster.some(n => typeof n !== 'string')))
        throw new Error('The crew list for “' + syl + '” on course “' + course + '” is damaged, so that file has not been opened.');
      for (const f of ['marks', 'dates']) {
        if (sv[f] != null && !isPlainObject(sv[f]))
          throw new Error('The ' + (f === 'marks' ? 'marks' : 'dates') + ' for “' + syl + '” on course “' + course + '” are damaged, so that file has not been opened.');
      }
    }
    for (const f of ['plan', 'lulls', 'pace']) {
      if (cv[f] != null && !isPlainObject(cv[f]))
        throw new Error('Course “' + course + '” in that file is damaged, so it has not been opened.');
    }
  }
}

export function readFile(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || obj.format !== FILE_FORMAT)
    throw new Error('That file is not an OCU Tracker file.');
  if (typeof obj.version !== 'number' || obj.version > FILE_VERSION)
    throw new Error('That file was written by a newer version of the app.');
  if (obj.charts != null) checkCharts(obj.charts);
  if (obj.students != null) checkStudents(obj.students);
  return {
    charts: obj.charts || null,
    students: obj.students || null,
    contains: {
      charts: !!(obj.contains && obj.contains.charts),
      students: !!(obj.contains && obj.contains.students),
    },
  };
}

export function describeFile(obj) {
  const { charts, contains } = readFile(obj);
  return {
    charts: contains.charts,
    students: contains.students,
    savedAt: obj.savedAt || null,
    syllabusNames: (charts && Array.isArray(charts.order)) ? charts.order.slice() : [],
  };
}

/* The name is a safety feature: a file holding people must look different in
   File Explorer and in an email attachment list. */
export function suggestedFileName(contains, savedAt) {
  const day = (savedAt || '').slice(0, 10) || 'undated';
  const flag = (contains && contains.students) ? 'WITH-STUDENTS-' : '';
  return `OCU-syllabus-${flag}${day}.json`;
}
