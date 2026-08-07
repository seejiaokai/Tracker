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

export function readFile(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || obj.format !== FILE_FORMAT)
    throw new Error('That file is not an OCU Tracker file.');
  if (typeof obj.version !== 'number' || obj.version > FILE_VERSION)
    throw new Error('That file was written by a newer version of the app.');
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
