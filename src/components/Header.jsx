import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as core from '../app/core.js';

/* The panel is always in the DOM and hidden with CSS, never conditionally
   rendered. Two reasons: the file name and the save tick-boxes have to stay
   readable while the menu is shut, and a button that is removed and recreated
   around a click is exactly how the file-picker gesture got spent before. */
function Menu({ id, label, title, children }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(null);
  const ref = useRef(null), btn = useRef(null);
  /* The panel is position:fixed and placed by hand. It used to be absolute
     inside the button — which works on a desktop and is DEAD on a phone, where
     the header scrolls sideways: an overflow container clips its own absolutely
     positioned children, so the panel was drawn but cut off at the 41px header
     and every tap landed on the view tabs underneath instead. */
  useLayoutEffect(() => {
    if (!open || !btn.current) { setAt(null); return; }
    const place = () => {
      const r = btn.current.getBoundingClientRect();
      const w = 200, pad = 6;
      setAt({
        left: Math.round(Math.max(pad, Math.min(r.left, innerWidth - w - pad))),
        top: Math.round(r.bottom + 5),
        maxHeight: Math.round(innerHeight - r.bottom - 5 - pad),
      });
    };
    place();
    addEventListener('resize', place);
    addEventListener('scroll', place, true);
    return () => { removeEventListener('resize', place); removeEventListener('scroll', place, true); };
  }, [open]);
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
      <button className={'sm' + (open ? ' primary' : '')} id={id + 'MenuBtn'} title={title} ref={btn}
        aria-expanded={open} onClick={() => setOpen(o => !o)}>{label} ▾</button>
      {/* Closing on bubble, so the item's own handler has already run — the
          file pickers throw if anything awaits before them. */}
      <div className={'menupanel' + (open ? ' on' : '')} id={id + 'MenuPanel'}
        style={at ? { left: at.left + 'px', top: at.top + 'px', maxHeight: at.maxHeight + 'px' } : undefined}
        onClick={e => { if (e.target.closest('button')) setOpen(false); }}>
        {children}
      </div>
    </span>
  );
}

/* Find one ball on a 210-event chart. On a phone the bar is one row that
   scrolls sideways, so the box hides behind a 🔍 button and opens as a
   full-width strip underneath — position:fixed and placed by hand for the same
   reason the menu panels are: an overflow container clips its own absolutely
   positioned children, so an absolute strip is drawn and then cut off at the
   41px header. */
function HeaderSearch() {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(null);
  const wrap = useRef(null), input = useRef(null);
  useLayoutEffect(() => {
    if (!open) { setAt(null); return; }
    const place = () => {
      const h = document.querySelector('header');
      setAt({ top: Math.round(h ? h.getBoundingClientRect().bottom + 4 : 44) });
    };
    place();
    addEventListener('resize', place);
    addEventListener('scroll', place, true);
    return () => { removeEventListener('resize', place); removeEventListener('scroll', place, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = e => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const hits = core.searchCount;
  const stat = !core.searchQ ? '' : (hits === 0 ? 'no match' : (hits === 1 ? '1 match' : `${core.searchAt + 1} of ${hits}`));
  return (
    <span className="findwrap" ref={wrap}>
      <button className="sm" id="hSearchBtn" title="Find an event on the chart"
        onClick={() => { setOpen(o => !o); setTimeout(() => input.current && input.current.focus(), 0); }}>🔍</button>
      <span className={'findpanel' + (open ? ' on' : '')} id="hSearchPanel"
        style={at ? { top: at.top + 'px' } : undefined}>
        <input id="hSearch" ref={input} placeholder="Find event…" value={core.searchQ}
          onChange={e => core.runSearch(e.target.value, false)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); core.runSearch(core.searchQ, true); }
            /* Not stopPropagation: Escape still has to reach the app's own
               handler, it simply clears the box first. */
            if (e.key === 'Escape') { core.clearSearch(); e.currentTarget.blur(); setOpen(false); }
          }} />
        <button className="sm" id="hSearchClear" title="Clear the search"
          onClick={() => { core.clearSearch(); if (input.current) input.current.focus(); }}>✕</button>
        <span className="findstat" id="hSearchStat">{stat}</span>
      </span>
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
        <div className="sub sub-strap">Multi-student · single platform · <span id="evCount">{core.SYL.length} events</span></div>
      </div>
      <div className="controls">
        {/* Crew leads the bar: it is the control that gets changed first every
            session. On the phone the title block is display:none, so being the
            first child of .controls is what puts it far left there too — no
            separate phone rule. It stays INSIDE .controls because the header
            checks scope to "header .controls" and a sibling would silently
            drop out of them. */}
        <label className="sub">Crew{' '}
          <select id="activeSel" value={core.active || ''} onChange={e => core.setActive(e.target.value)}>
            {core.roster.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <Menu id="view" label="View" title="Ways of looking at the syllabus">
          <button className="sm" id="showAllBtn" title="Show name, crew & prerequisites for every event" onClick={core.openShowAll}>☰ Show All</button>
          <div className="msep" />
          <button className="sm" id="ordCrew" title="Change the order crew appear in the dropdown and on every ball" onClick={core.openOrdCrew}>⇅ Reorder crew</button>
        </Menu>
        <HeaderSearch />

        <label className="sub">Course{' '}
          <select id="courseSel" value={core.course || ''} onChange={e => core.switchCourse(e.target.value)}>
            {core.COURSES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <Menu id="course" label="Course" title="Add, rename or delete a course">
          <button className="sm" id="addCourse" onClick={core.addCourse}>+ Add course</button>
          <button className="sm" id="renCourse" title="Rename the current course" onClick={core.renCourse}>✎ Rename course</button>
          <button className="sm" id="ordCourse" title="Change the order courses appear in the dropdown" onClick={core.openOrdCourse}>⇅ Reorder courses</button>
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
        {/* Everything used to CHOOSE what you are looking at sits to the left of
            this; everything you DO sits to the right. A real element rather than
            margin-left:auto on the File menu: with a wrapping bar an auto margin
            applies per flex line, so the right-hand group's alignment would
            depend on where the bar happened to wrap. */}
        <span className="hspacer" />

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

        <button className={'sm' + (core.arrangeMode ? ' primary' : '')} id="arrangeBtn" onClick={core.toggleArrange}>{core.arrangeMode ? '✓ Done' : '✎ Edit'}</button>
        <button className={'sm' + (core.showDetails ? ' primary' : '')} id="detailsBtn" title="Show title, type, crew & prerequisites on every ball on the flow chart" onClick={core.toggleDetails}>📋 Show All Details</button>
        {/* Save changes shows only when there is something to lose — marks and
            dates write themselves to storage, flow edits and the open file do
            not. The slot keeps its width whether the button is there or not: a
            header that grows on the first edit shifts the whole chart down and
            slides everything out from under the pointer mid-drag. */}
        <span className="saveslot">
          {dirty ? <button className="sm dirty" id="saveChanges" title="Save your work — the syllabus, and your file if one is open" onClick={core.saveChangesClick}>✓ Save changes ●</button> : null}
          {/* Green here while the orange button is showing would tell the user
              their work is both safe and at risk at once — the two watch
              different things (the store vs the file). Keep the words, drop
              the green until nothing is outstanding. Errors stay red. */}
          <span id="saveStat" className={'savestat ' + (dirty && core.saveStat.cls === 'ok' ? '' : core.saveStat.cls)}>{core.saveStat.text}</span>
        </span>
      </div>
    </header>
  );
}
