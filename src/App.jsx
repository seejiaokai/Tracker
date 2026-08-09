import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import * as core from './app/core.js';
import Header from './components/Header.jsx';
import Legend from './components/Legend.jsx';
import ArrangeTools from './components/ArrangeTools.jsx';
import SidePanel from './components/SidePanel.jsx';
import Pop from './components/Pop.jsx';
import ShowAllPanel from './components/ShowAllPanel.jsx';
import { EditModal, InfoModal, SylModal, OrdModal, CopyModal, DlgModal } from './components/Modals.jsx';
import { SideZoomCtl, FlowZoomCtl } from './components/ZoomControls.jsx';

function Board() {
  /* The flow chart is rendered imperatively into this container by the core
     engine (renderBoard), exactly as in the original app. */
  return <div className="board" id="board" tabIndex={0} />;
}

function Resizer() {
  const ref = useRef(null);
  useEffect(() => {
    const rz = ref.current; if (!rz) return;
    let dr = null;
    const down = e => { dr = { x: e.clientX, w: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sideW')) || 350 }; try { rz.setPointerCapture(e.pointerId); } catch (_) {} };
    const move = e => { if (!dr) return; let w = dr.w - (e.clientX - dr.x); w = Math.max(240, Math.min(680, w)); document.documentElement.style.setProperty('--sideW', w + 'px'); };
    const end = () => { dr = null; };
    rz.addEventListener('pointerdown', down);
    rz.addEventListener('pointermove', move);
    rz.addEventListener('pointerup', end); rz.addEventListener('pointercancel', end);
    return () => { rz.removeEventListener('pointerdown', down); rz.removeEventListener('pointermove', move); rz.removeEventListener('pointerup', end); rz.removeEventListener('pointercancel', end); };
  }, []);
  return <div className="resizer" id="resizer" ref={ref} />;
}

function ViewTabs({ tab, setTab }) {
  return (
    <div className="viewtabs" id="viewtabs">
      <button data-view="flow" className={tab === 'flow' ? 'active' : ''} onClick={() => setTab('flow')}>🗺 Flow chart</button>
      <button data-view="info" className={tab === 'info' ? 'active' : ''} onClick={() => setTab('info')}>ⓘ Info</button>
      <button id="showAllTab" onClick={core.openShowAll}>☰ Show All</button>
    </div>
  );
}

export default function App() {
  useSyncExternalStore(core.subscribe, core.getVersion);
  const [tab, setTab] = useState('flow');
  const [sideZoom, setSideZoom] = useState(1);

  useEffect(() => { core.init(); }, []);

  useEffect(() => {
    document.body.classList.toggle('tab-flow', tab === 'flow');
    document.body.classList.toggle('tab-info', tab === 'info');
  }, [tab]);

  /* Which tab is showing is React state, but the search has to reach it: on the
     Info tab the board is display:none, so scrolling to a found event would be
     measuring a hidden element and would land nowhere. */
  useEffect(() => { core.setTabSink(setTab); return () => core.setTabSink(null); }, []);

  useEffect(() => {
    const esc = e => core.handleEscapeKey(e);
    const del = e => core.handleDeleteKey(e);
    const clickAway = e => { if (core.pop && !e.target.closest('#pop') && !e.target.closest('.ball')) core.closePop(); };
    const unload = e => { if (core.sylDirty) { e.preventDefault(); e.returnValue = ''; } };
    document.addEventListener('keydown', esc);
    document.addEventListener('keydown', del);
    document.addEventListener('click', clickAway);
    window.addEventListener('beforeunload', unload);
    return () => {
      document.removeEventListener('keydown', esc);
      document.removeEventListener('keydown', del);
      document.removeEventListener('click', clickAway);
      window.removeEventListener('beforeunload', unload);
    };
  }, []);

  return (
    <>
      <Header />
      <ArrangeTools />
      {/* Zero-height wrapper: the hint FLOATS over the legend/board instead of
          occupying flow space. Its height changes with every tool switch and
          1.8s flash message; in flow that shoved the chart up and down under
          the pointer mid-draw, so lines connected to the wrong place. */}
      <div className="arrhintwrap">
        <div className={'arrhint' + (core.arrangeMode ? ' on' : '')} id="arrhint">{core.hintFlash || core.hintBase}</div>
      </div>
      <Legend />
      <ViewTabs tab={tab} setTab={setTab} />
      <div className="layout" id="layout">
        <Board />
        <Resizer />
        <SidePanel zoom={sideZoom} />
      </div>
      <SideZoomCtl zoom={sideZoom} setZoom={setSideZoom} />
      <FlowZoomCtl />
      <Pop />
      <ShowAllPanel />
      <InfoModal />
      <OrdModal />
      <CopyModal />
      <EditModal />
      <SylModal />
      <DlgModal />
    </>
  );
}
