import React from 'react';
import * as core from '../app/core.js';

export default function Header() {
  const sylNames = core.ready ? core.orderedSylNames() : [];
  const sylValue = (core.plan && core.plan.sylName) || core.DEFAULT_SYL_NAME;
  const sylOptions = sylNames.includes(sylValue) ? sylNames : [...sylNames, sylValue];

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
        <button className="sm" id="addCourse" onClick={core.addCourse}>+ Course</button>
        <button className="sm" id="renCourse" title="Rename the current course" onClick={core.renCourse}>Rename</button>
        <button className="sm" id="delCourse" title="Delete the current course" onClick={core.delCourse}>Del Course</button>
        {/* Fit and Reset layout live in the edit strip, not here: appearing only
            in edit mode, they used to shove Marking as onto the next row and slide
            every button out from under the pointer. */}
        <button className={'sm' + (core.arrangeMode ? ' primary' : '')} id="arrangeBtn" onClick={core.toggleArrange}>{core.arrangeMode ? '✓ Done' : '✎ Edit'}</button>
        <button className={'sm' + ((core.sylDirty || core.fileDirty) ? ' dirty' : '')} id="saveChanges" title="Save your work — the syllabus, and your file if one is open" onClick={core.saveChangesClick}>{(core.sylDirty || core.fileDirty) ? '✓ Save changes ●' : '✓ Save changes'}</button>
        <label className="sub" style={{ marginLeft: 8 }}>Syllabus{' '}
          <select id="sylSel" value={sylValue} onChange={e => core.switchSyllabus(e.target.value)}>
            {sylOptions.map(n => <option key={n} value={n}>{n + (core.CUSTOMS[n] ? ' ✎' : '')}</option>)}
          </select>
        </label>
        <span className="sylbtns">
          <button className="sm" id="dupSyl" title="Make an exact copy of the current syllabus, including every student's marks" onClick={core.dupSyl}>⧉ Duplicate syllabus</button>
          <button className="sm" id="addSyl" title="Create a new syllabus from the current structure with a clean slate (no marks)" onClick={core.addSyl}>+ Add syllabus</button>
          <button className="sm" id="renSyl" title="Rename the current syllabus (built-ins included)" onClick={core.renSyl}>✎ Rename syllabus</button>
          <button className="sm" id="ordSyl" title="Change the order syllabi appear in the dropdown" onClick={core.openOrd}>⇅ Reorder</button>
          <button className="sm" id="delSyl" title="Delete the current syllabus, built-in or custom. Deleted built-ins can be restored from Reorder." onClick={core.delSyl}>🗑 Delete syllabus</button>
        </span>
        <label className="sub">Marking as{' '}
          <select id="activeSel" value={core.active || ''} onChange={e => core.setActive(e.target.value)}>
            {core.roster.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <button className="sm" id="openFileBtn" title="Open your syllabus file, or start a new one" onClick={core.openFileClick}>📁 Open</button>
        <button className="sm" id="importSylBtn" title="Bring one syllabus in from another file, keeping everything you already have" onClick={core.importSyllabusClick}>⊕ Import syllabus</button>
        <button className="sm" id="saveCopyBtn" title="Save a separate copy to hand over — your own file is not touched" onClick={core.openCopy}>⤓ Save a copy</button>
        <span className="sub" id="openFileName">{core.openFileName || 'no file open'}</span>
        {core.lastSavedAt ? <span className="sub" id="lastSaved">· {core.lastSavedAt}</span> : null}
        {core.openFileHasStudents ? <span className="sub" id="fileHasStudents">· contains student data</span> : null}
        <label className="sub"><input type="checkbox" id="optCharts" checked={core.saveOpts.charts} onChange={e => core.setSaveOpt('charts', e.target.checked)} /> Charts</label>
        <label className="sub"><input type="checkbox" id="optStudents" checked={core.saveOpts.students} onChange={e => core.setSaveOpt('students', e.target.checked)} /> Students &amp; courses</label>
        <button className="sm" id="showAllBtn" title="Show name, crew & prerequisites for every event" onClick={core.openShowAll}>☰ Show All</button>
        <button className={'sm' + (core.showDetails ? ' primary' : '')} id="detailsBtn" title="Show title, type, crew & prerequisites on every ball on the flow chart" onClick={core.toggleDetails}>📋 Show All Details</button>
        <span id="saveStat" className={'savestat ' + core.saveStat.cls}>{core.saveStat.text}</span>
      </div>
    </header>
  );
}
