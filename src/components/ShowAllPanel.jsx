import React, { useState } from 'react';
import * as core from '../app/core.js';
import { groupByCategory, filterEvents } from '../app/eventOrder.js';

/* Compact in-place editor for one row of the Show All list — same five fields as the
   pop-up editor, so there is no need to open a modal on top of this panel. */
function SaEdit({ id, onDone }) {
  const init = core.infoFor(id);
  const [v, setV] = useState({
    name: init.name || '', fmt: init.fmt || '', hrs: init.hrs || '',
    crew: init.crew || '', pre: init.pre || '',
  });
  const set = k => e => setV(s => ({ ...s, [k]: e.target.value }));
  const save = async () => { await core.saveInfoFor(id, v); onDone(); };
  const reset = async () => {
    await core.resetInfoFor(id);
    const d = core.infoFor(id);
    setV({ name: d.name || '', fmt: d.fmt || '', hrs: d.hrs || '', crew: d.crew || '', pre: d.pre || '' });
  };
  /* Prerequisites is a free-text override; left blank the row falls back to the chart
     links, so show those as the placeholder rather than a generic example. */
  const chartPre = ((core.byid[id] || {}).prereqs || []).join(', ');
  /* Esc backs out without saving; Ctrl/Cmd+Enter saves from any field */
  const onKey = e => {
    if (e.key === 'Escape') { e.stopPropagation(); onDone(); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
  };
  return (
    <div className="saedit" onKeyDown={onKey}>
      <label>Name<input value={v.name} onChange={set('name')} autoFocus /></label>
      <label>Type / format<input value={v.fmt} onChange={set('fmt')} placeholder="e.g. Lecture, OFT/AMT" /></label>
      <label>Hours<input value={v.hrs} onChange={set('hrs')} placeholder="e.g. 1.5 Hrs" /></label>
      <label>Crew<textarea rows={2} value={v.crew} onChange={set('crew')} placeholder="e.g. UP/UW, IP/IW/FSI" /></label>
      <label className="full">Prerequisites<textarea rows={2} value={v.pre} onChange={set('pre')} placeholder={chartPre ? 'from the chart: ' + chartPre : 'e.g. AVI-02, AVI-03, AVI-04'} /></label>
      <div className="saedit-btns">
        <button className="sm" title="Revert to the value from the source document" onClick={reset}>Reset to doc</button>
        <button className="sm" onClick={onDone}>Cancel</button>
        <button className="sm primary" onClick={save}>Save</button>
      </div>
    </div>
  );
}

export default function ShowAllPanel() {
  const [q, setQ] = useState('');
  const [editId, setEditId] = useState(null);
  if (!core.showAllOpen) return null;
  /* Grouped by event code and numbered in order, so the list reads ST-01,
     ST-02 … and a search for "ST" returns that family on its own. */
  const rowText = e => {
    const d = core.infoFor(e.id);
    return e.id + ' ' + (d.name || '') + ' ' + (d.crew || '') + ' ' + (d.pre || '');
  };
  let shown = filterEvents(core.SYL, q, rowText);
  /* never filter away the row being edited — it would bin what has been typed */
  if (editId && !shown.some(e => e.id === editId)) {
    const cur = core.SYL.find(e => e.id === editId);
    if (cur) shown = shown.concat([cur]);
  }
  const blocks = [];
  groupByCategory(shown).forEach(({ cat, events: evs }) => {
    blocks.push(
      <React.Fragment key={cat}>
        <div className="saphase">{cat}</div>
        {evs.map(e => {
          const d = core.infoFor(e.id);
          const pv = core.preText(e.id);
          const editing = editId === e.id;
          return (
            <div className={'sarow' + (editing ? ' editing' : '')} key={e.id}>
              <span className="sdot" style={{ background: core.TYPE_COLOR[e.type] || '#888' }}></span>
              <div>
                <span className="sid">{e.id}</span> <span className="snm">{d.name || ''}</span>
                {editing ? <SaEdit key={e.id} id={e.id} onDone={() => setEditId(null)} /> : (
                  <div className="smeta">
                    {(d.fmt || d.hrs) ? <><b>Type:</b> {d.fmt || '—'}{d.hrs ? ' · ' + d.hrs : ''}<br /></> : null}
                    <b>Crew:</b> {d.crew ? d.crew : '—'}<br />
                    <b>Prerequisites:</b> {pv ? pv : '—'}
                  </div>
                )}
              </div>
              {editing ? null : <button className="sm sedit" onClick={() => setEditId(e.id)}>Edit</button>}
            </div>
          );
        })}
      </React.Fragment>
    );
  });
  return (
    <>
      <div className="overlay" id="saOverlay" style={{ zIndex: 80, display: 'block' }} onClick={core.closeShowAll}></div>
      <div id="showAllPanel" className="on">
        <div className="sahd">
          <h2>All events — name, crew &amp; prerequisites</h2>
          <input id="saSearch" placeholder="filter…" style={{ width: 150 }} value={q} onChange={e => setQ(e.target.value)} />
          <button id="saClose" onClick={core.closeShowAll}>Close</button>
        </div>
        <div id="saBody">{blocks.length ? blocks : <div className="mini">No matches.</div>}</div>
      </div>
    </>
  );
}
