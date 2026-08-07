import React, { useEffect, useRef, useState } from 'react';
import * as core from '../app/core.js';

/* The panel is always in the DOM and hidden with CSS, never conditionally
   rendered. Two reasons: the file name and the save tick-boxes have to stay
   readable while the menu is shut, and a button that is removed and recreated
   around a click is exactly how the file-picker gesture got spent before. */
function Menu({ id, label, title, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <span className="menu" ref={ref}>
      <button className={'sm' + (open ? ' primary' : '')} id={id + 'MenuBtn'} title={title}
        aria-expanded={open} onClick={() => setOpen(o => !o)}>{label} ▾</button>
      {/* Closing on bubble, so the item's own handler has already run — the
          file pickers throw if anything awaits before them. */}
      <div className={'menupanel' + (open ? ' on' : '')} id={id + 'MenuPanel'}
        onClick={e => { if (e.target.closest('button')) setOpen(false); }}>
        {children}
      </div>
    </span>
  );
}

export default function Header() {
  const sylNames = core.ready ? core.orderedSylNames() : [];
  const sylValue = (core.plan && core.plan.sylName) || core.DEFAULT_SYL_NAME;
  const sylOptions = sylNames.includes(sylValue) ? sylNames : [...sylNames, sylValue];
  const dirty = core.sylDirty || core.fileDirty;

  return (
    <header>
      <div>
        <h1 id="courseTitle">{core.course || ''} PROGRESS TRACKER</h1>
        <div className="sub">Multi-student · single platform · <span id="evCount">{core.SYL.length} events</span></div>
      </div>
      <div className="controls">
        <label className="sub">Course{' '}
          <select id="courseSel" value={core.course || ''} onChange={e => core.switchCourse(e.target.value)}>
            {core.COURSES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <Menu id="course" label="Course" title="Add, rename or delete a course">
          <button className="sm" id="addCourse" onClick={core.addCourse}>+ Add course</button>
          <button className="sm" id="renCourse" title="Rename the current course" onClick={core.renCourse}>✎ Rename course</button>
          <div className="msep" />
          <button className="sm" id="delCourse" title="Delete the current course" onClick={core.delCourse}>🗑 Delete course</button>
        </Menu>

        <label className="sub">Syllabus{' '}
          <select id="sylSel" value={sylValue} onChange={e => core.switchSyllabus(e.target.value)}>
            {sylOptions.map(n => <option key={n} value={n}>{n + (core.CUSTOMS[n] ? ' ✎' : '')}</option>)}
          </select>
        </label>
        <Menu id="syl" label="Syllabus" title="Duplicate, add, rename, reorder or delete a syllabus">
          <button className="sm" id="dupSyl" title="Make an exact copy of the current syllabus, including every student's marks" onClick={core.dupSyl}>⧉ Duplicate syllabus</button>
          <button className="sm" id="addSyl" title="Create a new syllabus from the current structure with a clean slate (no marks)" onClick={core.addSyl}>+ Add syllabus</button>
          <button className="sm" id="renSyl" title="Rename the current syllabus (built-ins included)" onClick={core.renSyl}>✎ Rename syllabus</button>
          <button className="sm" id="ordSyl" title="Change the order syllabi appear in the dropdown" onClick={core.openOrd}>⇅ Reorder syllabi</button>
          <div className="msep" />
          <button className="sm" id="delSyl" title="Delete the current syllabus, built-in or custom. Deleted built-ins can be restored from Reorder." onClick={core.delSyl}>🗑 Delete syllabus</button>
        </Menu>

        <label className="sub">Marking as{' '}
          <select id="activeSel" value={core.active || ''} onChange={e => core.setActive(e.target.value)}>
            {core.roster.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>

        <Menu id="file" label="File" title="Open your file, bring a syllabus in, or hand a copy over">
          <button className="sm" id="openFileBtn" title="Open your syllabus file, or start a new one" onClick={core.openFileClick}>📁 Open…</button>
          <button className="sm" id="importSylBtn" title="Bring one syllabus in from another file, keeping everything you already have" onClick={core.importSyllabusClick}>⊕ Import syllabus…</button>
          <button className="sm" id="saveCopyBtn" title="Save a separate copy to hand over — your own file is not touched" onClick={core.openCopy}>⤓ Save a copy…</button>
          <div className="msep" />
          <div className="mnote">
            <span id="openFileName">{core.openFileName || 'no file open'}</span>
            {core.lastSavedAt ? <span id="lastSaved"> · {core.lastSavedAt}</span> : null}
            {core.openFileHasStudents ? <span id="fileHasStudents"> · contains student data</span> : null}
          </div>
          <label className="sub"><input type="checkbox" id="optCharts" checked={core.saveOpts.charts} onChange={e => core.setSaveOpt('charts', e.target.checked)} /> Charts</label>
          <label className="sub"><input type="checkbox" id="optStudents" checked={core.saveOpts.students} onChange={e => core.setSaveOpt('students', e.target.checked)} /> Students &amp; courses</label>
        </Menu>

        <Menu id="view" label="View" title="Ways of looking at the syllabus">
          <button className="sm" id="showAllBtn" title="Show name, crew & prerequisites for every event" onClick={core.openShowAll}>☰ Show All</button>
        </Menu>

        <button className={'sm' + (core.arrangeMode ? ' primary' : '')} id="arrangeBtn" onClick={core.toggleArrange}>{core.arrangeMode ? '✓ Done' : '✎ Edit'}</button>
        <button className={'sm' + (core.showDetails ? ' primary' : '')} id="detailsBtn" title="Show title, type, crew & prerequisites on every ball on the flow chart" onClick={core.toggleDetails}>📋 Show All Details</button>
        {/* Save changes shows only when there is something to lose — marks and
            dates write themselves to storage, flow edits and the open file do
            not. The slot keeps its width whether the button is there or not: a
            header that grows on the first edit shifts the whole chart down and
            slides everything out from under the pointer mid-drag. */}
        <span className="saveslot">
          {dirty ? <button className="sm dirty" id="saveChanges" title="Save your work — the syllabus, and your file if one is open" onClick={core.saveChangesClick}>✓ Save changes ●</button> : null}
          <span id="saveStat" className={'savestat ' + core.saveStat.cls}>{core.saveStat.text}</span>
        </span>
      </div>
    </header>
  );
}
