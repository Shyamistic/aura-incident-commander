// frontend/src/components/AgentGraph.jsx
import React, { useEffect, useRef } from 'react';

export default function AgentGraph({ activeAgent }) {
  
  // --- THIS IS THE FIX ---
  // Refs MUST be defined inside the component using the useRef hook
  const refs = {
    Orchestrator: useRef(null),
    DeployAgent: useRef(null),
    MonitorAgent: useRef(null),
    ReasoningAgent: useRef(null),
    HealAgent: useRef(null),
  };
  // --- END OF FIX ---

  useEffect(() => {
    if (!activeAgent) return;
    const el = refs[activeAgent]?.current;
    if (!el) return; // Guard clause in case ref isn't ready

    el.classList.add('pulse');
    setTimeout(() => {
      // Check if el still exists on cleanup
      if (el) {
        el.classList.remove('pulse');
      }
    }, 900);
  }, [activeAgent]); // Dependency array is correct

  return (
    <div className="agent-graph-wrapper">
      <svg width="100%" height="330" viewBox="0 0 800 330" className="agent-graph-svg">
        
        {/* Nodes are now connected to the correct refs */}
        <g>
          <circle ref={refs.Orchestrator} className="agent-node-circle" cx={150} cy={165} r={55} fill="#0d0f17" stroke="var(--color-accent-glow)" strokeWidth="3" />
          <text className="agent-node-text" x={150} y={170}>Orchestrator</text>
        </g>

        <g>
          <circle ref={refs.DeployAgent} className="agent-node-circle" cx={350} cy={110} r={45} fill="#1e3a8a" stroke="#3b82f6" strokeWidth="3" />
          <text className="agent-node-text" x={350} y={115}>DeployAgent</text>
        </g>

        <g>
          <circle ref={refs.MonitorAgent} className="agent-node-circle" cx={550} cy={110} r={45} fill="#14532d" stroke="#22c55e" strokeWidth="3" />
          <text className="agent-node-text" x={550} y={115}>MonitorAgent</text>
        </g>
        
        <g>
          <circle ref={refs.ReasoningAgent} className="agent-node-circle" cx={650} cy={240} r={40} fill="#3730a3" stroke="var(--color-ai-glow)" strokeWidth="3" />
          <text className="agent-node-text" x={650} y={245}>AI Brain</text>
        </g>

        <g>
          <circle ref={refs.HealAgent} className="agent-node-circle" cx={450} cy={240} r={40} fill="#4a1d96" stroke="#a855f7" strokeWidth="3" />
          <text className="agent-node-text" x={450} y={245}>HealAgent</text>
        </g>

        {/* Lines (unchanged) */}
        <line className="agent-node-line" x1={205} y1={165} x2={305} y2={120} />
        <line className="agent-node-line" x1={395} y1={110} x2={505} y2={110} />
        <line className="agent-node-line" x1={570} y1={155} x2={630} y2={210} />
        <line className="agent-node-line" x1={610} y1={240} x2={490} y2={240} />
      </svg>
    </div>
  );
}