import React, { useEffect, useRef } from 'react';
import * as core from '../app/core.js';

/* The calendar that the lull pop-up shows. It used to live in the side panel
   with a "Click sets" dropdown offering Last Flown (Currency), Last Flown
   (Syllabus) and Expected end date — all three already had their own boxes in
   the panel above, and setting a lull meant choosing "Lull start", clicking,
   choosing "Lull end", clicking. It only sets lull periods now. */
function LullCalendar() {
  const pick = core.lullPick;
  const s = pick.student;
  const calView = core.calView;
  const y = calView.getFullYear(), m = calView.getMonth();
  const first = new Date(y, m, 1); const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7)); // Mon start
  const today = core.parseD(core.isoToday());
  const editing = pick.index >= 0 ? (core.lulls[s] || [])[pick.index] : null;
  const spans = (core.lulls[s] || [])
    .filter((l, i) => i !== pick.index)
    .map(l => [core.parseD(l.start), core.parseD(l.end)]).filter(a => a[0] && a[1]);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getTime() + i * core.DAY); const iso = core.isoOf(d);
    let cls = 'day'; if (d.getMonth() !== m) cls += ' out';
    if (d.getTime() === today.getTime()) cls += ' today';
    const cols = [];
    if (iso === pick.start) cols.push('#16584a');
    if (spans.some(([a, b]) => d >= a && d <= b)) cols.push('#3a3030');
    const bg = core.sliceBg(cols);
    cells.push(
      <div key={iso} className={cls} data-iso={iso} style={bg ? { background: bg } : undefined}
        onClick={() => core.lullDayClick(iso)}>{d.getDate()}</div>
    );
  }
  const mn = calView.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  return (
    <>
      <div className="lullback" onClick={core.closeLullPicker} />
      <div className="lullcal on" id="lullCal">
        <div className="lullhd">
          <b>{editing ? 'Change lull period' : 'Set lull period'} — {s}</b>
          <button className="sm" id="lullClose" onClick={core.closeLullPicker}>✕</button>
        </div>
        <div className="mini" id="lullStep">
          {pick.start
            ? <>Start <b>{core.fmt(core.parseD(pick.start))}</b> — now pick the last day.</>
            : <>Pick the first day of the period.</>}
        </div>
        <div className="cal">
          <div className="hd">
            <button className="sm" id="lullPrev" onClick={core.calPrev}>‹</button>
            <b>{mn}</b>
            <button className="sm" id="lullNext" onClick={core.calNext}>›</button>
          </div>
          <div className="grid">
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => <div key={d} className="dow">{d}</div>)}
            {cells}
          </div>
        </div>
        <div className="mini" style={{ marginTop: 6 }}>Changing month does not pick a day. Escape closes without saving.</div>
      </div>
    </>
  );
}

/* Copy one student's periods onto others. */
function LullCopy() {
  const c = core.lullCopy;
  const others = core.roster.filter(r => r !== c.from);
  return (
    <>
      <div className="lullback" onClick={core.closeLullCopy} />
      <div className="lullcal on" id="lullCopy">
        <div className="lullhd">
          <b>Copy {c.from}’s lull periods to</b>
          <button className="sm" id="lullCopyClose" onClick={core.closeLullCopy}>✕</button>
        </div>
        {others.length
          ? others.map(r => (
            <label className="sub lullpick" key={r}>
              <input type="checkbox" value={r} checked={c.picked.includes(r)}
                onChange={e => core.toggleLullCopy(r, e.target.checked)} /> {r}
            </label>
          ))
          : <div className="mini">Nobody else on this course yet.</div>}
        <div className="mini" style={{ marginTop: 6 }}>This replaces their periods with a copy of {c.from}’s.</div>
        <div className="lullbtns">
          <button className="sm" onClick={core.closeLullCopy}>Cancel</button>
          <button className="sm primary" id="lullCopyOk" disabled={!c.picked.length} onClick={core.applyLullCopy}>Copy</button>
        </div>
      </div>
    </>
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

  /* Pace and both end dates belong to the student being marked, not the course. */
  const rem = st.remaining;
  const myPace = core.paceOf(s);
  const epwRaw = myPace.epw;                 /* exactly what is in the box */
  const epw = core.epwOf(s);                 /* what the arithmetic uses */
  let projEnd = '—';
  if (rem > 0 && epw > 0) {
    let weeks = rem / epw; let end = new Date(today.getTime() + Math.ceil(weeks * 7) * core.DAY);
    end = new Date(end.getTime() + Math.ceil(core.lullDaysIn(s, today.getTime(), end.getTime())) * core.DAY); projEnd = core.fmt(end);
  }
  const tgt = core.parseD(myPace.target); let reqEpw = '—';
  if (tgt) { const wk = (core.daysBetween(today, tgt) - core.lullDaysIn(s, today.getTime(), tgt.getTime())) / 7; reqEpw = wk > 0 ? (rem / wk).toFixed(1) : 'past'; }
  const tgt2 = core.parseD(myPace.target2); let reqEpw2 = '—';
  if (tgt2) { const wk = (core.daysBetween(today, tgt2) - core.lullDaysIn(s, today.getTime(), tgt2.getTime())) / 7; reqEpw2 = wk > 0 ? (rem / wk).toFixed(1) : 'past'; }

  /* plannable now (matches the original inline computation) */
  let fr = 0; core.SYL.forEach(e => { if (core.isDone(s, e.id)) fr = Math.max(fr, core.rowOf(e.id)); });
  const near = availNow.filter(e => core.rowOf(e.id) <= fr + 5);

  return (
    <div className={cls} id="side" ref={ref} style={style}>
      {/* Only the cards are scaled. The lull pop-ups stay outside: a zoomed
          ancestor shifts a position:fixed child's origin and they would land
          in the wrong place. */}
      <div className="sidescale">
      <div className="card c-students">
        <h3>Students <button className="sm" id="addStu" onClick={core.addStudent}>+ Add</button></h3>
        <div className="chips">
          {core.roster.map((r, i) => (
            <span key={r} className="chip"><b>{i + 1}</b> {r} <span className="x" data-rm={r} onClick={() => core.removeStudent(r)}>×</span></span>
          ))}
        </div>
        {/* Wrapped so the phone can shrink it — it is the tallest card there. */}
        <div className="keyball" dangerouslySetInnerHTML={{ __html: core.renderKeyBall() }} />
      </div>
      <div className="card c-overall">
        <h3>Overall <span className="who">— {s}</span></h3>
        <div className="big">
          <div className="num"><div className="v">{(st.totPct * 100).toFixed(1)}%</div><div className="l">Complete</div></div>
          <div className="num"><div className="v">{st.totDone}</div><div className="l">Done</div></div>
          <div className="num"><div className="v">{st.remaining}</div><div className="l">Remaining</div></div>
        </div>
        <div className="bar"><div style={{ width: (st.totPct * 100).toFixed(1) + '%' }}></div></div>
        <div className="kvGrid">
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
      </div>
      <div className="card c-next">
        <h3>Next event (flow-based)</h3>
        <div className="kvGrid">
        {core.NEXT_CATS.map(c => {
          const opts = core.nextOfCat(s, c.pred);
          return (
            <div className="kv" key={c.key}>
              <span>{c.label}</span>
              <b>{opts.length
                ? opts.map((o, i) => (
                  <React.Fragment key={o.id}>
                    {i > 0 && <> <span className="mini">or</span> </>}
                    <span className={'branch' + (o.ready ? '' : ' notyet')}
                      title={o.ready ? 'Can be flown next' : 'Not yet — earlier events have to be done first'}>{o.id}</span>
                  </React.Fragment>
                ))
                : <b>Complete</b>}</b>
            </div>
          );
        })}
        </div>
        <div className="mini" style={{ marginTop: 5 }}>Two chips = the flow branches; either can be flown next. Faded and dashed = coming up, but something has to be done first.</div>
      </div>
      <div className="card c-plan">
        <h3>{/* One flex child, or space-between spreads the three pieces across the
            whole heading. */}
          <span>Plannable now <span className="mini" style={{ fontWeight: 400 }}>(shows up to 5 rows)</span><span className="who"> — {s}</span></span></h3>
        <div className="chips">
          {near.length
            ? near.map(e => <span key={e.id} className="chip" style={{ borderColor: core.TYPE_COLOR[e.type] }}><b>{e.id}</b></span>)
            : <span className="mini">none within reach</span>}
        </div>
      </div>
      <div className="card wide c-curr">
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
        <div className="flexPair">
          <div className="flexbar" style={{ background: cur.color }}>{cur.txt}</div>
          <div className="flexbar" style={{ background: fx.color }}>{fx.txt}</div>
        </div>
        <div className="mini" style={{ marginTop: 5 }}>Landing currency = days since last currency (minus down days). Flex requirement uses days since last <b>syllabus</b> flight, so updating currency won’t change it.</div>
      </div>
      <div className="card wide c-pace">
        <h3>Pace &amp; expected end <span className="who">— {s}</span></h3>
        {/* Set pace takes the whole width; the two end dates share the row below.
            Three across needed 419px in a 301px panel and pushed End date B off
            the right edge of the window. */}
        <div className="opt2 paceGrid">
          <div className="o">
            <div className="t">Set pace</div>
            <div className="paceRow">
              <div className="field" style={{ margin: 0 }}>
                <input type="number" step="0.1" min="0.5" id="epwIn" value={epwRaw ?? ''} style={{ width: 52 }} onChange={e => core.setEpw(s, e.target.value)} /> <span className="mini">/wk</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="r">{projEnd}</div><div className="mini">projected end</div>
              </div>
            </div>
          </div>
          <div className="o">
            <div className="t">End date A</div>
            <input type="date" id="targetIn" value={myPace.target || ''} onChange={e => core.setTarget(s, e.target.value)} />
            <div className="r" style={{ marginTop: 6 }}>{reqEpw}{reqEpw !== '—' && reqEpw !== 'past' ? ' /wk' : ''}</div><div className="mini">req. pace</div>
          </div>
          <div className="o">
            <div className="t">End date B</div>
            <input type="date" id="targetIn2" value={myPace.target2 || ''} onChange={e => core.setTarget2(s, e.target.value)} />
            <div className="r" style={{ marginTop: 6 }}>{reqEpw2}{reqEpw2 !== '—' && reqEpw2 !== 'past' ? ' /wk' : ''}</div><div className="mini">req. pace</div>
          </div>
        </div>
        <div className="mini" style={{ marginTop: 6 }}>Baseline 2 events/wk. Both end-date paces exclude this student’s lull periods.</div>
      </div>
      <div className="card c-lull">
        <h3>Lull periods <span className="who">— {s}</span></h3>
        <div className="chips" id="lullChips">
          {(core.lulls[s] || []).length
            ? (core.lulls[s] || []).map((l, i) => (
              /* Tapping the period reopens the calendar on it — the same
                 pop-up that made it, so there is one way to set these dates. */
              <span key={i} className="chip lullchip" title="Tap to change these dates"
                onClick={() => core.openLullPicker(s, i)}>
                <b>{core.fmt(core.parseD(l.start))}</b>→<b>{core.fmt(core.parseD(l.end))}</b>
                <span className="x" data-lull={i}
                  onClick={e => { e.stopPropagation(); core.removeLull(s, i); }}>×</span>
              </span>
            ))
            : <span className="mini">none</span>}
        </div>
        <div className="lullbtns">
          <button className="sm" id="setLullBtn" onClick={() => core.openLullPicker(s, null)}>+ Set lull period</button>
          <button className="sm" id="copyLullBtn" disabled={core.roster.length < 2}
            title="Copy these periods onto other students" onClick={() => core.openLullCopy(s)}>⧉ Copy to…</button>
        </div>
      </div>
      </div>
      {core.lullPick ? <LullCalendar /> : null}
      {core.lullCopy ? <LullCopy /> : null}
    </div>
  );
}
