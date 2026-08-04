import React from 'react';

export default function Legend() {
  return (
    <div className="legend">
      <span><b>Centre = type:</b></span>
      <span><i className="sw" style={{ background: 'var(--flight)' }}></i>Flight</span>
      <span><i className="sw" style={{ background: 'var(--acad)' }}></i>Acad/Spec</span>
      <span><i className="sw" style={{ background: 'var(--test)' }}></i>Test</span>
      <span><i className="sw" style={{ background: 'var(--sim)' }}></i>Sim</span>
      <span><i className="sw" style={{ background: 'var(--device)' }}></i>CFT/IAT/EPT</span>
      <span style={{ marginLeft: 8 }}><b>Ring segment per student:</b></span>
      <span><i className="sw" style={{ background: '#000' }}></i>DCO</span>
      <span><i className="sw" style={{ background: 'var(--dpco)' }}></i>DPCO</span>
      <span><i className="sw" style={{ background: 'var(--marg)' }}></i>Marginal</span>
      <span><i className="sw" style={{ background: 'var(--na)' }}></i>NA</span>
      <span><i className="sw" style={{ background: '#fff', border: '1px solid #888' }}></i>Not done</span>
    </div>
  );
}
