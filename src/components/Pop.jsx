import React, { useLayoutEffect, useRef, useState } from 'react';
import * as core from '../app/core.js';

export default function Pop() {
  const p = core.pop;
  const ref = useRef(null);
  const [posn, setPosn] = useState(null);

  useLayoutEffect(() => {
    if (!p || !ref.current) { setPosn(null); return; }
    const r = ref.current.getBoundingClientRect();
    let x = p.x, y = p.y + 12;
    if (x + r.width > innerWidth - 8) x = innerWidth - r.width - 8;
    if (y + r.height > innerHeight - 8) y = p.y - r.height - 12;
    setPosn({ x, y });
  }, [p]);

  if (!p) return null;
  const s = core.active;
  const isFlight = core.byid[p.id] && core.byid[p.id].type === 'flight';
  const style = posn
    ? { display: 'block', left: posn.x + 'px', top: posn.y + 'px' }
    : { display: 'block', left: p.x + 'px', top: (p.y + 12) + 'px', visibility: 'hidden' };

  return (
    <div className="pop" id="pop" ref={ref} style={style}>
      <div className="t" id="popTitle">{p.id}  ·  {s}</div>
      <div className="opts">
        <button onClick={() => core.popGrade('0')}><span className="dot" style={{ background: '#fff' }}></span>Not done</button>
        <button onClick={() => core.popGrade('dco')}><span className="dot" style={{ background: '#000' }}></span>DCO</button>
        <button onClick={() => core.popGrade('dpco')}><span className="dot" style={{ background: 'var(--dpco)' }}></span>DPCO</button>
        <button onClick={() => core.popGrade('marg')}><span className="dot" style={{ background: 'var(--marg)' }}></span>Marginal</button>
        <button onClick={() => core.popGrade('na')}><span className="dot" style={{ background: 'var(--na)' }}></span>N.A.</button>
        <button onClick={() => core.popGrade('cancel')}>Close</button>
      </div>
      <div className="fails">
        <span className="mini">Fails:</span>
        <button className="sm" id="popFailMinus" title="One fewer failure" onClick={() => core.popFail(-1)}>−</button>
        <span id="failCount" style={{ minWidth: 14, textAlign: 'center' }}>{core.failOf(s, p.id)}</span>
        <button className="sm" id="popFailPlus" title="Record another failure" onClick={() => core.popFail(1)}>+</button>
      </div>
      {isFlight && (
        <div id="popFlightRow" style={{ display: 'block', marginTop: 8, borderTop: '1px dashed #262c38', paddingTop: 8 }}>
          <div className="mini" style={{ marginBottom: 4 }}>Flight date — sets Last Flown (currency &amp; syllabus)</div>
          <input type="date" id="popFlightDate" style={{ width: '100%' }} value={core.popFlightDate} onChange={e => core.popFlightChanged(e.target.value)} />
        </div>
      )}
      <div id="popInfo" style={{ marginTop: 8, borderTop: '1px dashed #262c38', paddingTop: 8, fontSize: 12 }} dangerouslySetInnerHTML={{ __html: core.infoHtml(p.id) }} />
      <button className="sm" id="popEditInfo" style={{ marginTop: 6, width: '100%' }} onClick={() => { const id = p.id; core.closePop(); core.openInfo(id); }}>✎ Edit details</button>
    </div>
  );
}
