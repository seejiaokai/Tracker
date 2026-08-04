import React, { useState } from 'react';
import * as core from '../app/core.js';

export default function ShowAllPanel() {
  const [q, setQ] = useState('');
  if (!core.showAllOpen) return null;
  const query = q.toLowerCase();
  const phases = []; const seen = {};
  core.SYL.forEach(e => { const p = e.phase || 'Other'; if (!seen[p]) { seen[p] = []; phases.push(p); } seen[p].push(e); });
  const blocks = [];
  phases.forEach(p => {
    const evs = seen[p].filter(e => {
      const d = core.infoFor(e.id);
      const hay = (e.id + ' ' + (d.name || '') + ' ' + (d.crew || '') + ' ' + (d.pre || '')).toLowerCase();
      return !query || hay.includes(query);
    });
    if (!evs.length) return;
    blocks.push(
      <React.Fragment key={p}>
        <div className="saphase">{p}</div>
        {evs.map(e => {
          const d = core.infoFor(e.id);
          const pv = core.preText(e.id);
          return (
            <div className="sarow" key={e.id}>
              <span className="sdot" style={{ background: core.TYPE_COLOR[e.type] || '#888' }}></span>
              <div>
                <span className="sid">{e.id}</span> <span className="snm">{d.name || ''}</span>
                <div className="smeta">
                  {(d.fmt || d.hrs) ? <><b>Type:</b> {d.fmt || '—'}{d.hrs ? ' · ' + d.hrs : ''}<br /></> : null}
                  <b>Crew:</b> {d.crew ? d.crew : '—'}<br />
                  <b>Prerequisites:</b> {pv ? pv : '—'}
                </div>
              </div>
              <button className="sm sedit" onClick={() => core.openInfo(e.id)}>Edit</button>
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
