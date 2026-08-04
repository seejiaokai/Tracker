import React, { useEffect, useRef } from 'react';
import * as core from '../app/core.js';

function Calendar() {
  const s = core.active;
  const calView = core.calView;
  const y = calView.getFullYear(), m = calView.getMonth();
  const first = new Date(y, m, 1); const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7)); // Mon start
  const today = core.parseD(core.isoToday());
  const lc = core.dates[s].lastCurr, ls = core.dates[s].lastSyll, tg = core.plan.target, tg2 = core.plan.target2;
  const lulls = (core.plan.lulls || []).map(l => [core.parseD(l.start), core.parseD(l.end)]).filter(a => a[0] && a[1]);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getTime() + i * core.DAY); const iso = core.isoOf(d);
    let cls = 'day'; if (d.getMonth() !== m) cls += ' out';
    if (d.getTime() === today.getTime()) cls += ' today';
    const cols = [];
    if (iso === lc) cols.push('#203a2a'); if (iso === ls) cols.push('#2a3550');
    if (iso === tg || iso === tg2) cols.push('#16384a');
    if (lulls.some(([a, b]) => d >= a && d <= b)) cols.push('#3a3030');
    const bg = core.sliceBg(cols);
    cells.push(
      <div key={iso} className={cls} data-iso={iso} style={bg ? { background: bg } : undefined} onClick={() => core.calDayClick(iso)}>{d.getDate()}</div>
    );
  }
  const mn = calView.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  return (
    <div className="cal">
      <div className="hd">
        <button className="sm" id="calPrev" onClick={core.calPrev}>‹</button>
        <b>{mn}</b>
        <button className="sm" id="calNext" onClick={core.calNext}>›</button>
      </div>
      <div className="grid">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => <div key={d} className="dow">{d}</div>)}
        {cells}
      </div>
      <div className="mini" style={{ marginTop: 5 }}>
        <i className="sw" style={{ background: '#203a2a' }}></i>Curr{' '}
        <i className="sw" style={{ background: '#2a3550' }}></i>Syll{' '}
        <i className="sw" style={{ background: '#16384a' }}></i>End{' '}
        <i className="sw" style={{ background: '#3a3030' }}></i>Lull
      </div>
    </div>
  );
}

export default function SidePanel({ zoom }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) core.dragScroll(ref.current); }, []);
  const s = core.active;
  const style = { zoom: zoom, cursor: 'grab' };
  const cls = 'side' + (zoom < 1 ? ' zoomed' : '');

  if (!core.ready || !s || !core.dates[s]) {
    return (
      <div className={cls} id="side" ref={ref} style={style}>
        {core.ready && (
          <div className="card">
            <h3>Students <button className="sm" id="addStu" onClick={core.addStudent}>+ Add</button></h3>
            <div className="mini">No students on this course yet. Add one to start tracking progress.</div>
          </div>
        )}
      </div>
    );
  }

  const st = core.stats(s); const availNow = core.availableNow(s); const today = core.parseD(core.isoToday());
  const lc = core.parseD(core.dates[s].lastCurr), ls = core.parseD(core.dates[s].lastSyll);
  const dCurr = lc ? core.daysBetween(lc, today) : null, dSyll = ls ? core.daysBetween(ls, today) : null;
  const downDays = Math.max(0, parseInt(core.dates[s].downDays || 0) || 0);
  const effCurr = (dCurr == null) ? null : Math.max(0, dCurr - downDays);
  const fx = core.flexFor(dSyll);
  const cur = core.landingCurrency(effCurr);

  // EPW two options
  const rem = st.remaining;
  const epw = core.plan.epw || 2;
  let projEnd = '—';
  if (rem > 0 && epw > 0) {
    let weeks = rem / epw; let end = new Date(today.getTime() + Math.ceil(weeks * 7) * core.DAY);
    end = new Date(end.getTime() + Math.ceil(core.lullDaysIn(today.getTime(), end.getTime())) * core.DAY); projEnd = core.fmt(end);
  }
  const tgt = core.parseD(core.plan.target); let reqEpw = '—';
  if (tgt) { const wk = (core.daysBetween(today, tgt) - core.lullDaysIn(today.getTime(), tgt.getTime())) / 7; reqEpw = wk > 0 ? (rem / wk).toFixed(1) : 'past'; }
  const tgt2 = core.parseD(core.plan.target2); let reqEpw2 = '—';
  if (tgt2) { const wk = (core.daysBetween(today, tgt2) - core.lullDaysIn(today.getTime(), tgt2.getTime())) / 7; reqEpw2 = wk > 0 ? (rem / wk).toFixed(1) : 'past'; }

  /* plannable now (matches the original inline computation) */
  let fr = 0; core.SYL.forEach(e => { if (core.isDone(s, e.id)) fr = Math.max(fr, core.rowOf(e.id)); });
  const near = availNow.filter(e => core.rowOf(e.id) <= fr + 5);

  return (
    <div className={cls} id="side" ref={ref} style={style}>
      <div className="card">
        <h3>Students <button className="sm" id="addStu" onClick={core.addStudent}>+ Add</button></h3>
        <div className="chips">
          {core.roster.map((r, i) => (
            <span key={r} className="chip"><b>{i + 1}</b> {r} <span className="x" data-rm={r} onClick={() => core.removeStudent(r)}>×</span></span>
          ))}
        </div>
        <span dangerouslySetInnerHTML={{ __html: core.renderKeyBall() }} />
      </div>
      <div className="card">
        <h3>Overall — {s}</h3>
        <div className="big">
          <div className="num"><div className="v">{(st.totPct * 100).toFixed(1)}%</div><div className="l">Complete</div></div>
          <div className="num"><div className="v">{st.totDone}</div><div className="l">Done</div></div>
          <div className="num"><div className="v">{st.remaining}</div><div className="l">Remaining</div></div>
        </div>
        <div className="bar"><div style={{ width: (st.totPct * 100).toFixed(1) + '%' }}></div></div>
        {core.BUCKETS.map(b => {
          const d = st.buckets[b.key];
          return (
            <div className="kv" key={b.key}>
              <span>{d.label}</span>
              <b>{d.done}/{d.total}{d.na ? <> <span className="mini">({d.na}NA)</span></> : null} · {(d.pct * 100).toFixed(0)}%</b>
            </div>
          );
        })}
      </div>
      <div className="card">
        <h3>Next event (flow-based)</h3>
        {core.NEXT_CATS.map(c => {
          const opts = core.nextOfCat(s, c.pred);
          return (
            <div className="kv" key={c.key}>
              <span>{c.label}</span>
              <b>{opts.length
                ? opts.map((o, i) => (
                  <React.Fragment key={o.id}>
                    {i > 0 && <> <span className="mini">or</span> </>}
                    <span className="branch">{o.id}</span>
                  </React.Fragment>
                ))
                : <b>Complete</b>}</b>
            </div>
          );
        })}
        <div className="mini" style={{ marginTop: 5 }}>Two chips = the flow branches; either can be flown next.</div>
      </div>
      <div className="card">
        <h3>Plannable now <span className="mini" style={{ fontWeight: 400 }}>(shows up to 5 rows)</span> — {s}</h3>
        <div className="chips">
          {near.length
            ? near.map(e => <span key={e.id} className="chip" style={{ borderColor: core.TYPE_COLOR[e.type] }}><b>{e.id}</b></span>)
            : <span className="mini">none within reach</span>}
        </div>
      </div>
      <div className="card">
        <h3>Currency &amp; flex</h3>
        <div className="curGrid">
          <div className="field"><label>Last Flown (Syllabus)</label><input type="date" id="lastSyll" value={core.dates[s].lastSyll || ''} onChange={e => core.setLastSyll(s, e.target.value)} /></div>
          <div className="field"><label>Last Flown (Currency)</label><input type="date" id="lastCurr" value={core.dates[s].lastCurr || ''} onChange={e => core.setLastCurr(s, e.target.value)} /></div>
          <div className="field"><label>No. of Down Days</label><input type="number" min="0" id="downDays" value={core.dates[s].downDays || ''} style={{ width: 80 }} onChange={e => core.setDownDays(s, e.target.value)} /></div>
          <div className="field"><label>Upchit Date</label><input type="date" id="upchit" value={core.dates[s].upchit || ''} onChange={e => core.setUpchit(s, e.target.value)} /></div>
        </div>
        <div className="curKv">
          <div className="kv"><span>Days since syllabus</span><b>{dSyll == null ? '—' : dSyll + 'd'}</b></div>
          <div className="kv"><span>Days since currency</span><b>{dCurr == null ? '—' : dCurr + 'd'}{downDays ? <> <span className="mini">(−{downDays} down = {effCurr}d)</span></> : null}</b></div>
        </div>
        <div className="flexbar" style={{ background: cur.color, marginTop: 8 }}>{cur.txt}</div>
        <div className="flexbar" style={{ background: fx.color, marginTop: 6 }}>{fx.txt}</div>
        <div className="mini" style={{ marginTop: 5 }}>Landing currency = days since last currency (minus down days). Flex requirement uses days since last <b>syllabus</b> flight, so updating currency won’t change it.</div>
      </div>
      <div className="card">
        <h3>Pace &amp; expected end</h3>
        <div className="opt2" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div className="o">
            <div className="t">Set pace</div>
            <div className="field" style={{ margin: 0 }}>
              <input type="number" step="0.1" min="0.5" id="epwIn" defaultValue={epw} style={{ width: 52 }} onChange={e => core.setEpw(e.target.value)} /> <span className="mini">/wk</span>
            </div>
            <div className="r" style={{ marginTop: 6 }}>{projEnd}</div><div className="mini">projected end</div>
          </div>
          <div className="o">
            <div className="t">End date A</div>
            <input type="date" id="targetIn" value={core.plan.target || ''} style={{ width: '100%' }} onChange={e => core.setTarget(e.target.value)} />
            <div className="r" style={{ marginTop: 6 }}>{reqEpw}{reqEpw !== '—' && reqEpw !== 'past' ? ' /wk' : ''}</div><div className="mini">req. pace</div>
          </div>
          <div className="o">
            <div className="t">End date B</div>
            <input type="date" id="targetIn2" value={core.plan.target2 || ''} style={{ width: '100%' }} onChange={e => core.setTarget2(e.target.value)} />
            <div className="r" style={{ marginTop: 6 }}>{reqEpw2}{reqEpw2 !== '—' && reqEpw2 !== 'past' ? ' /wk' : ''}</div><div className="mini">req. pace</div>
          </div>
        </div>
        <div className="mini" style={{ marginTop: 6 }}>Baseline 2 events/wk. Both end-date paces exclude lull periods below.</div>
      </div>
      <div className="card">
        <h3>Lull periods (course)</h3>
        <div className="chips" id="lullChips">
          {(core.plan.lulls || []).length
            ? (core.plan.lulls || []).map((l, i) => (
              <span key={i} className="chip"><b>{core.fmt(core.parseD(l.start))}</b>→<b>{core.fmt(core.parseD(l.end))}</b> <span className="x" data-lull={i} onClick={() => core.removeLull(i)}>×</span></span>
            ))
            : <span className="mini">none</span>}
        </div>
        <div className="mini" style={{ marginTop: 6 }}>Use the calendar: set mode to “Lull start”, click a day, then “Lull end”, click a day.</div>
      </div>
      <div className="card" id="calCard">
        <h3>Calendar</h3>
        <Calendar />
        <div className="field" style={{ marginTop: 8 }}>
          <label>Click sets:</label>
          <select id="calMode" value={core.calMode} onChange={e => core.setCalMode(e.target.value)}>
            <option value="lastCurr">Last Flown (Currency)</option>
            <option value="lastSyll">Last Flown (Syllabus)</option>
            <option value="target">Expected end date</option>
            <option value="lullStart">Lull start</option>
            <option value="lullEnd">Lull end</option>
          </select>
        </div>
      </div>
    </div>
  );
}
