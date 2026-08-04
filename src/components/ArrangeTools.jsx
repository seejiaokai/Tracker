import React from 'react';
import * as core from '../app/core.js';

const TOOLS = [
  { t: 'move', label: '✋ Move', title: 'Drag balls to reposition' },
  { t: 'select', label: '▣ Select', title: 'Drag a box on empty space to select several balls, then drag any of them to move the group' },
  { t: 'connect', label: '→ Connect', title: 'Click prerequisite first, then the event that depends on it' },
  { t: 'delball', label: '🗑 Delete', title: 'Delete whatever is selected — events or a line. With nothing selected, click an event, a drawn line, or a prerequisite arrow to delete it.', style: { borderLeft: '4px solid var(--red)' } },
];
const ADDS = [
  { a: 'flight', label: '+ Flight', style: { borderLeft: '4px solid var(--flight)' } },
  { a: 'acad', label: '+ Acad', style: { borderLeft: '4px solid var(--acad)' } },
  { a: 'test', label: '+ Test', style: { borderLeft: '4px solid var(--test)' } },
  { a: 'sim', label: '+ Sim', style: { borderLeft: '4px solid var(--sim)' } },
  { a: 'device', label: '+ CFT/IAT/EPT', style: { borderLeft: '4px solid var(--device)' } },
];
const TOOLS2 = [
  { t: 'text', label: '✎ Text', title: 'Click a ball to edit its text/type/number' },
  { t: 'line', label: '╱ Line', title: 'Draw a free right-angle line: click to start, then click where it ends. Ends snap to a ball or to another line; anything left loose stays unlinked.' },
  { t: 'editlines', label: '❐ Edit lines', title: 'Show N/E/S/W snap points on every ball; select a line and drag its ends onto them' },
];

export default function ArrangeTools() {
  return (
    <div className={'arrtools' + (core.arrangeMode ? ' on' : '')} id="arrTools">
      {TOOLS.map(o => (
        <button key={o.t} className={core.tool === o.t ? 'primary' : ''} title={o.title} style={o.style} onClick={() => core.toolButtonClick(o.t)}>{o.label}</button>
      ))}
      <span className="sep"></span>
      {ADDS.map(o => (
        <button key={o.a} style={o.style} onClick={() => core.addModule(o.a)}>{o.label}</button>
      ))}
      <span className="sep"></span>
      {TOOLS2.map(o => (
        <button key={o.t} className={core.tool === o.t ? 'primary' : ''} title={o.title} onClick={() => core.toolButtonClick(o.t)}>{o.label}</button>
      ))}
      <button id="arrowBtn" title="Select a line — drawn or prerequisite — then cycle: arrow at end → arrow at other end → no arrow" onClick={core.arrowClick}>➤ Arrow</button>
      <button className={core.tool === 'merge' ? 'primary' : ''} title="Click one line then a crossing line: the hop is removed, and near-parallel drawn lines snap flush into one straight run. Drawn lines are merged by default." onClick={() => core.toolButtonClick('merge')}>✕ Merge</button>
      <button className={core.tool === 'unmerge' ? 'primary' : ''} title="Click one line then a crossing line to give the crossing an inverted-U hop. Works on drawn lines as well as prerequisite arrows." onClick={() => core.toolButtonClick('unmerge')}>⌢ Unmerge</button>
      <span className="sep"></span>
      <button id="selectAllBtn" title="Select every ball so the font box applies to all" onClick={core.selectAllClick}>▣ Select all</button>
      <label className="sub">Font <input id="fontIn" className="fontnum" type="number" min="4" max="20" step="0.5" defaultValue="8.5" onChange={e => core.setFont(e.target.value)} /></label>
      <span className="sep"></span>
      <button id="undoBtn" title="Undo last flow edit" onClick={core.doUndo}>↶ Undo</button>
      <button id="redoBtn" title="Redo" onClick={core.doRedo}>↷ Redo</button>
      <button id="fitBtn" title="Fit the whole flow in view" onClick={core.fitView}>⤢ Fit</button>
      <span className="sep"></span>
      <button id="editSyl" title="Open the full event list to edit names, types, crew and prerequisites" onClick={core.openModal}>📋 Edit events</button>
      <div className="arrnote">Double-click any pokéball on the chart to edit that event directly.</div>
    </div>
  );
}
