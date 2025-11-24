// frontend/src/components/ColoredLogs.jsx
import React, { useRef, useEffect } from 'react';

// Map event types/sources to severity
const severityFor = (ev) => {
  if (!ev) return 'info';
  const t = ev.type || '';
  const s = ev.source || '';
  if (t.includes('error') || t.includes('failed')) return 'error';
  if (s === 'ReasoningAgent') return 'reasoning';
  if (t.includes('alarm') || s === 'MonitorAgent') return 'alert';
  if (t.includes('completed') || t.includes('success') || s === 'HealAgent') return 'success';
  if (t.includes('simulate') && t.includes('triggered')) return 'warn';
  return 'info';
}

export default function ColoredLogs({ events = [] }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [events.length]);

  return (
    <div ref={containerRef} className="live-logs-container">
      {events.slice(-200).map((ev, i) => {
        const sev = severityFor(ev);
        return (
          <div key={i} className={`log-entry log-sev-${sev}`}>
            <div className="log-time">{new Date(ev.ts).toLocaleTimeString()}</div>
            <div style={{ flex: 1 }}>
              <div className="log-source">{ev.source || ev.type}</div>
              <div className="log-detail">
                {typeof ev.detail === 'string' ? ev.detail : JSON.stringify(ev.detail)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}