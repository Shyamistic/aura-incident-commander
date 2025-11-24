// frontend/src/components/Timeline.jsx
import React from 'react';

function Step({ label, active, done }) {
  return (
    <div className={`timeline-step ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
      <div className="timeline-step-icon">
        {done ? '✓' : active ? '...' : ''}
      </div>
      <div>{label}</div>
    </div>
  );
}

export default function Timeline({ events = [] }) {
  const have = (type) => events.some(e => e.type === type || e.source === type);
  
  const steps = [
    { key: 'plan.start', label: 'Goal Received' },
    { key: 'deploy.completed', label: 'Deploy Complete' },
    { key: 'alarm.received', label: 'Alarm Detected' },
    { key: 'reasoning.started', label: 'AI Analysis' },
    { key: 'heal.started', label: 'Healing Initiated' },
    { key: 'heal.completed', label: 'Incident Resolved' },
  ];

  let activeKey = null;
  let activeIndex = -1;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (have(steps[i].key)) {
      activeKey = steps[i].key;
      activeIndex = i;
      break;
    }
  }

  return (
    <div className="timeline">
      {steps.map((s, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return <Step key={s.key} label={s.label} active={active} done={done} />;
      })}
    </div>
  );
}