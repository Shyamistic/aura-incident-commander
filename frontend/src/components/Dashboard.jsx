// frontend/src/components/Dashboard.jsx
import React, { useState, useEffect, useRef } from 'react';
import AgentGraph from './AgentGraph';
import Timeline from './Timeline';
import ColoredLogs from './ColoredLogs';
import IncidentSummary from './IncidentSummary';
import CloudMap from './CloudMap';

export default function Dashboard() {
  const [goal, setGoal] = useState('Deploy, Monitor, and Autonomously Heal a demo application');
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState([]);
  const [activeAgent, setActiveAgent] = useState(null);
  
  const ORCH_URL = import.meta.env.VITE_ORCH_URL || 'http://localhost:3000';
  const lastTsRef = useRef(null);

  // This function is only for pushing *local* (non-polled) events
  function pushLocal(ev) {
    setEvents(prev => [...prev, ev].slice(-400));
  }

  async function sendGoal() {
    setRunning(true);
    try {
      await fetch(`${ORCH_URL}/goal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal })
      });
    } catch (e) {
      console.error('sendGoal error', e);
      pushLocal({
        ts: new Date().toISOString(),
        source: 'Dashboard',
        type: 'error',
        detail: 'Failed to connect to orchestrator. Is it running?'
      });
    } finally {
      setRunning(false);
    }
  }

  async function simulateFailure() {
    try {
      await fetch(`${ORCH_URL}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
    } catch (e) {
      console.error('simulate error', e);
      pushLocal({
        ts: new Date().toISOString(),
        source: 'Dashboard',
        type: 'error',
        detail: 'Failed to connect to orchestrator.'
      });
    }
  }

  // --- *** THIS IS THE MAIN FIX *** ---
  // The polling logic is now in its own useEffect
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`${ORCH_URL}/events`);
        if (!res.ok) throw new Error('events fetch failed');
        const list = await res.json();
        if (cancelled) return;

        const newEvents = lastTsRef.current ? list.filter(ev => ev.ts > lastTsRef.current) : list.slice(-30);
        
        if (newEvents.length > 0) {
          lastTsRef.current = newEvents[newEvents.length - 1].ts;
          // Batch update: add all new events in one go
          setEvents(prev => [...prev, ...newEvents].slice(-400));
        }
      } catch (e) {
        console.warn('poll error', e);
      }
      if (!cancelled) {
        setTimeout(poll, 1200);
      }
    };
    
    poll(); // Start the polling loop
    
    return () => { cancelled = true; }; // Cleanup on unmount
  }, [ORCH_URL]); // This effect ONLY runs once on mount

  // This second, separate effect ONLY runs when 'events' changes
  // This breaks the infinite loop.
  useEffect(() => {
    const lastEvent = events[events.length - 1];
    if (lastEvent && lastEvent.source && ['DeployAgent', 'MonitorAgent', 'ReasoningAgent', 'HealAgent', 'Orchestrator'].includes(lastEvent.source)) {
      setActiveAgent(lastEvent.source);
    }
  }, [events]); // <-- This now correctly depends on 'events'
  // --- *** END OF FIX *** ---

  // --- DERIVED STATE (Unchanged) ---
  const timelineEvents = events.filter(e => [
    'plan.start', 
    'deploy.completed', 
    'alarm.received', 
    'reasoning.started',
    'heal.started', 
    'heal.completed'
  ].includes(e.type));

  const rcaEvent = [...events].reverse().find(e => e.type === 'reasoning.completed')?.detail;
  const latestAlarm = [...events].reverse().find(e => e.type === 'alarm.received');
  const latestHeal = [...events].reverse().find(e => e.type === 'heal.completed');
  
  return (
    <div className="dashboard-layout">
      
      <div className="grid-header">
        <h1 className="header-title">Autonomous Incident Commander</h1>
        <p className="header-subtitle">/ AI-Powered Cloud Orchestration /</p>
      </div>

      <div className="grid-controls card controls-card">
        <textarea 
          className="goal-input"
          value={goal} 
          onChange={e => setGoal(e.target.value)} 
          rows={3} 
        />
        <div className="button-group">
          <button onClick={sendGoal} disabled={running}>
            {running ? 'Running...' : '🚀 Deploy'}
          </button>
          <button onClick={simulateFailure} className="danger">
            🔥 Simulate Failure
          </button>
        </div>
      </div>

      <div className="grid-main">
        <div className="card">
          <h3>Mission Timeline</h3>
          <Timeline events={timelineEvents} />
        </div>
        <div className="card">
          <h3>Cloud Map</h3>
          <CloudMap events={events} />
        </div>
      </div>

      <div className="grid-sidebar">
        <div className="card">
          <h3>AI Analysis (RCA)</h3>
          <IncidentSummary 
            rcaEvent={rcaEvent} 
            alarmEvent={latestAlarm}
            healEvent={latestHeal}
          />
        </div>
        <div className="card" style={{ marginTop: '20px' }}>
          <h3>Agent Graph</h3>
          <AgentGraph activeAgent={activeAgent} />
        </div>
      </div>

      <div className="grid-logs card">
        <h3>Live Logs</h3>
        <ColoredLogs events={events} />
      </div>

    </div>
  );
}