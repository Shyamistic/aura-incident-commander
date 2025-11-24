// frontend/src/components/CloudMap.jsx
import React, { useEffect, useState } from 'react';

export default function CloudMap({ events = [] }) {
  const [state, setState] = useState('idle');

  useEffect(() => {
    const last = events[events.length - 1];
    if (!last) return;

    switch (last.type) {
      case 'plan.start':
      case 'goal.received':
        setState('deploying');
        break;
      case 'deploy.completed':
        setState('deployed');
        setTimeout(() => setState('monitoring'), 800);
        break;
      case 'simulate.triggered':
      case 'alarm.received':
        setState('alert');
        break;
      case 'reasoning.started':
        setState('reasoning');
        break;
      case 'heal.completed':
        setState('healed');
        setTimeout(() => setState('monitoring'), 800);
        break;
    }
  }, [events.length]);

  return (
    <div className="cloud-map">
      <div className="cloud-map-nodes">
        <div className={`cloud-node lambda ${state === 'deploying' || state === 'deployed' ? 'active' : ''}`}>
          Lambda
        </div>
        <div className={`cloud-node watch ${state === 'monitoring' || state === 'alert' ? 'active' : ''} ${state === 'alert' ? 'alert' : ''}`}>
          CloudWatch
        </div>
        <div className={`cloud-node sns ${state === 'alert' ? 'active' : ''}`}>
          SNS
        </div>
        <div className={`cloud-node brain ${state === 'reasoning' ? 'active' : ''}`}>
          AI Brain
        </div>
      </div>
    </div>
  );
}