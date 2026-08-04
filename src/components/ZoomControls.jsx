import React from 'react';
import * as core from '../app/core.js';

export function SideZoomCtl({ zoom, setZoom }) {
  return (
    <div id="sideZoomCtl" title="Zoom the info panel out to screenshot everything">
      <button id="szOut" title="Zoom out" onClick={() => setZoom(z => Math.max(0.1, +(z - 0.1).toFixed(2)))}>−</button>
      <span id="szPct">{Math.round(zoom * 100)}%</span>
      <button id="szIn" title="Zoom in" onClick={() => setZoom(z => Math.min(1.6, +(z + 0.1).toFixed(2)))}>+</button>
      <button id="szReset" className="sm" title="Reset zoom" onClick={() => setZoom(1)}>reset</button>
    </div>
  );
}

export function FlowZoomCtl() {
  return (
    <div id="flowZoomCtl" title="Zoom the flow chart" style={{ display: core.arrangeMode ? 'none' : '' }}>
      <button id="fzOut" title="Zoom out" onClick={() => core.setFlowZoom(Math.max(0.1, +(core.flowZoom - 0.1).toFixed(2)))}>−</button>
      <span id="fzPct">{Math.round(core.flowZoom * 100)}%</span>
      <button id="fzIn" title="Zoom in" onClick={() => core.setFlowZoom(Math.min(3, +(core.flowZoom + 0.1).toFixed(2)))}>+</button>
      <button id="fzReset" className="sm" title="Reset zoom" onClick={() => core.setFlowZoom(1)}>reset</button>
    </div>
  );
}
