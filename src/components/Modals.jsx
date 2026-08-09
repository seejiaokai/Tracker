import React, { useEffect, useRef, useState } from 'react';
import * as core from '../app/core.js';

/* ---------- generic in-page dialog (uiConfirm / uiPrompt / uiAlert / uiChoice) ---------- */
export function DlgModal() {
  const d = core.dlg;
  const [val, setVal] = useState('');
  const serialRef = useRef(-1);
  const inputRef = useRef(null);
  useEffect(() => {
    if (d && serialRef.current !== core.dlgSerial) {
      serialRef.current = core.dlgSerial;
      setVal(d.def || '');
      if (d.input) setTimeout(() => { const el = inputRef.current; if (el) { el.focus(); el.select(); } }, 30);
    }
  });
  if (!d) return null;
  const ok = () => core.dlgClose(d.input ? val : true);
  const cancel = () => core.dlgClose(d.input ? null : false);
  return (
    <>
      <div className="overlay" id="dlgOverlay" style={{ zIndex: 70, display: 'block' }} onClick={cancel}></div>
      <div className="modal" id="dlgModal" style={{ zIndex: 71, width: 'min(420px, 92vw)', display: 'block' }}>
        <div id="dlgMsg" style={{ fontSize: 13.5, whiteSpace: 'pre-wrap', marginBottom: 12 }}>{d.msg}</div>
        {d.input && (
          <input id="dlgInput" ref={inputRef} style={{ width: '100%', marginBottom: 12 }} value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') cancel(); }} />
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {d.cancel && <button id="dlgCancel" onClick={cancel}>Cancel</button>}
          {d.alt && <button id="dlgAlt" onClick={() => core.dlgClose('__alt__')}>{d.alt}</button>}
          <button className="primary" id="dlgOk" onClick={ok}>{d.ok}</button>
        </div>
      </div>
    </>
  );
}

/* ---------- inline ball editor (Edit poke-ball) ---------- */
function EditModalInner({ id }) {
  const ev = core.byid[id];
  const d = core.infoFor(id);
  const [text, setText] = useState(ev.label || ev.id);
  const [type, setType] = useState(ev.type);
  const [num, setNum] = useState(ev.num != null ? String(ev.num) : '');
  const [crew, setCrew] = useState(d.crew || '');
  const [pre, setPre] = useState(d.pre || '');
  const [links, setLinks] = useState((ev.prereqs || []).join(', '));
  const [err, setErr] = useState('');
  const save = async () => {
    const e = await core.saveEdit({ text, type, num, crew, pre, links });
    if (e) setErr(e);
  };
  return (
    <div className="modal" id="editModal" style={{ width: 'min(460px,92vw)', display: 'block' }}>
      <h2>Edit poke-ball</h2>
      <div className="field"><label>Text</label><input id="edText" style={{ flex: 1 }} value={text} onChange={e => setText(e.target.value)} /></div>
      <div className="field"><label>Colour / type</label>
        <select id="edType" value={type} onChange={e => setType(e.target.value)}>
          <option value="flight">Flight (blue)</option>
          <option value="acad">Acad / Spec (green)</option>
          <option value="test">Test (red)</option>
          <option value="sim">Sim (yellow)</option>
          <option value="device">CFT/IAT/EPT (purple)</option>
        </select>
      </div>
      <div className="field"><label>Number (badge)</label><input id="edNum" type="text" style={{ width: 90 }} placeholder="optional" value={num} onChange={e => setNum(e.target.value)} /></div>
      <div className="field"><label>Crew</label><input id="edCrew" style={{ flex: 1 }} placeholder="e.g. IP / UW, UP / IW" value={crew} onChange={e => setCrew(e.target.value)} /></div>
      <div className="field"><label>Prereq links</label><input id="edLinks" style={{ flex: 1 }} placeholder="comma-separated event IDs — draws the arrows" value={links} onChange={e => setLinks(e.target.value)} /></div>
      <div className="field"><label>Prerequisites (note)</label><input id="edPre" style={{ flex: 1 }} placeholder="free text shown in the details bubble" value={pre} onChange={e => setPre(e.target.value)} /></div>
      <small className="hint" style={{ display: 'block', marginTop: 2 }}>Prereq links drive the arrows on the chart and what counts as available. The note is the wording shown under Crew in the details bubble — leave it blank to fall back to the links.</small>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'space-between' }}>
        <button id="edDelete" style={{ borderColor: 'var(--red)', color: '#ffb3a0' }} onClick={core.deleteFromEditModal}>Delete ball</button>
        <span><button id="edCancel" onClick={core.closeEdit}>Cancel</button> <button className="primary" id="edSave" onClick={save}>Save</button></span>
      </div>
      <div id="edErr" style={{ color: 'var(--red)', marginTop: 8, fontSize: 12 }}>{err}</div>
    </div>
  );
}
export function EditModal() {
  const id = core.editId;
  return (
    <>
      {(id != null || core.sylModalOpen) && (
        <div className="overlay" id="overlay" style={{ display: 'block' }} onClick={() => { core.closeModal(); core.closeEdit(); }}></div>
      )}
      {id != null && core.byid[id] && <EditModalInner key={id} id={id} />}
    </>
  );
}

/* ---------- event info editor ---------- */
function InfoModalInner({ id }) {
  const init = core.infoFor(id);
  const [name, setName] = useState(init.name || '');
  const [fmtV, setFmtV] = useState(init.fmt || '');
  const [hrs, setHrs] = useState(init.hrs || '');
  const [crew, setCrew] = useState(init.crew || '');
  const [pre, setPre] = useState(init.pre || '');
  const reset = async () => {
    await core.resetInfo();
    const d = core.infoFor(id);
    setName(d.name || ''); setFmtV(d.fmt || ''); setHrs(d.hrs || ''); setCrew(d.crew || ''); setPre(d.pre || '');
  };
  return (
    <>
      {/* above #showAllPanel (81) so it can never open behind the Show All list */}
      <div className="overlay" id="infoOverlay" style={{ zIndex: 90, display: 'block' }} onClick={core.closeInfo}></div>
      <div className="modal" id="infoModal" style={{ zIndex: 91, width: 'min(440px,94vw)', display: 'block' }}>
        <h2 id="infoTitle">{id} — details</h2>
        <div className="field"><label>Name</label><input id="ifName" style={{ flex: 1 }} value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="field"><label>Type / format</label><input id="ifFmt" style={{ flex: 1 }} placeholder="e.g. Lecture, OFT/AMT, 2 x F-15SG" value={fmtV} onChange={e => setFmtV(e.target.value)} /></div>
        <div className="field"><label>Hours</label><input id="ifHrs" style={{ width: 120 }} placeholder="e.g. 1.5 Hrs" value={hrs} onChange={e => setHrs(e.target.value)} /></div>
        <div className="field" style={{ alignItems: 'flex-start' }}><label>Crew</label><textarea id="ifCrew" placeholder="e.g. UP/UW, IP/IW/FSI" value={crew} onChange={e => setCrew(e.target.value)} /></div>
        <div className="field" style={{ alignItems: 'flex-start' }}><label>Prerequisites</label><textarea id="ifPre" placeholder="e.g. AVI-02, AVI-03, AVI-04" value={pre} onChange={e => setPre(e.target.value)} /></div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
          <button id="ifReset" title="Revert to the value from the source document" style={{ marginRight: 'auto' }} onClick={reset}>Reset to doc</button>
          <button id="ifCancel" onClick={core.closeInfo}>Cancel</button>
          <button className="primary" id="ifSave" onClick={() => core.saveInfo({ name, fmt: fmtV, hrs, crew, pre })}>Save</button>
        </div>
      </div>
    </>
  );
}
export function InfoModal() {
  const id = core.infoId;
  if (id == null) return null;
  return <InfoModalInner key={id} id={id} />;
}

/* ---------- syllabus editor (raw JSON) ---------- */
function SylModalInner() {
  const [text, setText] = useState(() => JSON.stringify(core.SYL, null, 1));
  const [err, setErr] = useState('');
  const save = async () => { const e = await core.saveSylText(text); if (e) setErr(e); };
  return (
    <div className="modal" id="sylModal" style={{ display: 'block' }}>
      <h2>Edit events / flow</h2>
      <small className="hint">Each event: {'{'}"id","type","phase","seq","prereqs":[...]{'}'}. type = flight | acad | test | sim | device. Two events sharing the same prereqs run in parallel (branch). Edit and Save to regenerate the board — then hit “Save changes” in the header to keep it.</small>
      <textarea id="sylText" spellCheck={false} value={text} onChange={e => setText(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
        <button id="sylCancel" onClick={core.closeModal}>Cancel</button>
        <button className="primary" id="sylSave" onClick={save}>Save</button>
      </div>
      <div id="sylErr" style={{ color: 'var(--red)', marginTop: 8, fontSize: 12 }}>{err}</div>
    </div>
  );
}
export function SylModal() {
  if (!core.sylModalOpen) return null;
  return <SylModalInner />;
}

/* ---------- reorder syllabi, courses or crew ----------
   One component, three modes. The rows, the drag handling and the ▲/▼ buttons
   are identical; only the list, the row tag and where it saves differ. Three
   copies would mean fixing the next drag bug three times — and drag-and-drop
   does not work by touch, so the ▲/▼ path is the only one a phone has. */
const ORD_MODES = {
  syllabus: {
    title: 'Syllabus order',
    note: 'Drag a row, or use ▲/▼. This sets the order of the Syllabus dropdown for every course.',
    read: () => core.orderedSylNames(),
    tag: n => (core.builtinOf(n) ? (core.CUSTOMS[n] ? 'built-in ✎ edited' : 'built-in') : 'custom'),
    save: l => core.saveOrderList(l),
  },
  course: {
    title: 'Course order',
    note: 'Drag a row, or use ▲/▼. This sets the order of the Course dropdown, and everyone sharing this tracker sees it.',
    read: () => core.COURSES.slice(),
    tag: n => (n === core.course ? 'current' : ''),
    save: l => core.saveCourseOrder(l),
  },
  crew: {
    title: 'Crew order',
    note: 'Drag a row, or use ▲/▼. This also sets which slice of every ball belongs to whom — first in the list is the first slice.',
    read: () => core.roster.slice(),
    tag: (n, i) => '#' + (i + 1),
    save: l => core.saveCrewOrder(l),
  },
};
function OrdModalInner({ mode }) {
  const cfg = ORD_MODES[mode] || ORD_MODES.syllabus;
  const [list, setList] = useState(() => cfg.read());
  const fromRef = useRef(null);
  /* Deleted built-ins can only be restored for syllabi; courses and crew have
     no shipped originals to come back from. */
  const hid = mode === 'syllabus' ? core.SYL_NAMES.filter(n => core.isHidden(n)) : [];
  const move = (i, j) => setList(l => { const a = [...l]; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const restore = async n => {
    await core.restoreHiddenSyl(n);
    setList(l => (l.includes(n) ? l : [...l, n]));
  };
  return (
    <>
      <div className="overlay" id="ordOverlay" style={{ zIndex: 70, display: 'block' }} onClick={core.closeOrd}></div>
      <div className="modal" id="ordModal" data-ord={mode} style={{ zIndex: 71, width: 'min(420px,92vw)', display: 'block' }}>
        <h2 id="ordTitle">{cfg.title}</h2>
        <div className="mini" style={{ marginBottom: 8 }}>{cfg.note}</div>
        <div id="ordList" style={{ maxHeight: '52vh', overflow: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
          {list.map((n, i) => {
            const tag = cfg.tag(n, i);
            return (
              <div key={n} className="ordrow" draggable
                onDragStart={e => { fromRef.current = i; try { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; } catch (_) {} e.currentTarget.classList.add('drag'); }}
                onDragEnd={e => { e.currentTarget.classList.remove('drag'); document.querySelectorAll('#ordList .ordrow').forEach(r => r.classList.remove('over')); }}
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('over'); }}
                onDragLeave={e => e.currentTarget.classList.remove('over')}
                onDrop={e => {
                  e.preventDefault(); const to = i; const from = fromRef.current;
                  if (from == null || from === to) return;
                  setList(l => { const a = [...l]; const [m] = a.splice(from, 1); a.splice(to, 0, m); return a; });
                  fromRef.current = null;
                }}>
                <span className="grip">☰</span>
                <span className="onm">{n}</span>
                <span className="otag">{tag}</span>
                <button title="Move up" disabled={i === 0} onClick={e => { e.stopPropagation(); move(i, i - 1); }}>▲</button>
                <button title="Move down" disabled={i === list.length - 1} onClick={e => { e.stopPropagation(); move(i, i + 1); }}>▼</button>
              </div>
            );
          })}
        </div>
        {hid.length > 0 && (
          <div id="ordHiddenWrap" style={{ marginTop: 12 }}>
            <div className="mini" style={{ marginBottom: 6 }}>Deleted built-in syllabi — restore to bring one back into the dropdown.</div>
            <div id="ordHidden" style={{ maxHeight: '22vh', overflow: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
              {hid.map(n => (
                <div key={n} className="ordrow">
                  <span className="onm">{n}</span><span className="otag">deleted</span>
                  <button title="Restore this built-in syllabus" onClick={() => restore(n)}>↺ Restore</button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
          <button id="ordAlpha" style={{ marginRight: 'auto' }} title="Sort A to Z" onClick={() => setList(l => [...l].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })))}>A–Z</button>
          <button id="ordCancel" onClick={core.closeOrd}>Cancel</button>
          <button className="primary" id="ordSave" onClick={() => cfg.save(list)}>Save order</button>
        </div>
      </div>
    </>
  );
}
export function OrdModal() {
  if (!core.ordMode) return null;
  /* Keyed on the mode so switching lists rebuilds the working copy rather than
     reordering the previous one. */
  return <OrdModalInner key={core.ordMode} mode={core.ordMode} />;
}

/* ---------- Save a copy: pick what goes into a file you hand over ---------- */
function CopyModalInner() {
  const names = core.orderedSylNames();
  const picked = names.filter(n => core.copyPick[n]).length;
  return (
    <>
      <div className="overlay" id="copyOverlay" style={{ zIndex: 90, display: 'block' }} onClick={core.closeCopy}></div>
      <div className="modal" id="copyModal" style={{ zIndex: 91, width: 'min(460px, 92vw)', display: 'block' }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Save a copy</div>
        <div className="mini" style={{ marginBottom: 10 }}>
          For handing work over. Your own file is not touched.
        </div>
        <label style={{ display: 'block', marginBottom: 6 }}>
          <input type="checkbox" id="copyCharts" checked={core.copyOpts.charts}
            onChange={e => core.setCopyOpt('charts', e.target.checked)} /> Charts
        </label>
        <label style={{ display: 'block', marginBottom: 4 }}>
          <input type="checkbox" id="copyStudents" checked={core.copyOpts.students}
            onChange={e => core.setCopyOpt('students', e.target.checked)} /> Students &amp; courses
        </label>
        <div className="mini" id="copyWarn" style={{ marginBottom: 10, opacity: core.copyOpts.students ? 1 : 0.65 }}>
          {core.copyOpts.students
            ? '⚠ This copy will contain real names and marks. Only send it to someone entitled to see them.'
            : 'Names and marks stay out — safe to send.'}
        </div>
        <div className="mini" style={{ marginBottom: 6 }}>Syllabi to include ({picked} ticked)</div>
        <div id="copySylList" style={{ maxHeight: '30vh', overflow: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 6 }}>
          {names.map(n => (
            <label key={n} style={{ display: 'block', padding: '2px 4px' }}>
              <input type="checkbox" checked={!!core.copyPick[n]}
                onChange={e => core.setCopyPick(n, e.target.checked)} /> {n}
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
          <button id="copyCancel" onClick={core.closeCopy}>Cancel</button>
          <button className="primary" id="copyOk" onClick={core.saveCopyClick}>Save copy</button>
        </div>
      </div>
    </>
  );
}
export function CopyModal() {
  if (!core.copyOpen) return null;
  return <CopyModalInner />;
}
