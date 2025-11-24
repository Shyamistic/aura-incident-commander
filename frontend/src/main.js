// main.js
// Autonomous AWS Incident Commander: logic for polling, rendering, demo mode, accessibility

// Configurable backend URL
const ORCH_URL = window.ORCH_URL || 'http://localhost:5000';  // Default, can override

// State
let lastTs = null;
window.__EVENTS__ = []; // Dev-only log
let allEvents = [];
let DEMO_MODE = false;
let DEMO_SEQUENCE = []; // Pre-seeded demo events
let elements = {};

// Severity mapping utility
const sevMap = {
  error: 'error',
  failed: 'error',
  ReasoningAgent: 'reasoning',
  alarm: 'alert',
  MonitorAgent: 'alert',
  completed: 'success',
  success: 'success',
  HealAgent: 'success',
  simulate: 'warn',
  triggered: 'warn',
};

// On DOM loaded, cache elements and attach handlers
document.addEventListener('DOMContentLoaded', () => {
  // Element cache
  elements = {
    goalInput: document.getElementById('goal-input'),
    btnDeploy: document.getElementById('btn-deploy'),
    btnSimulate: document.getElementById('btn-simulate'),
    btnDemo: document.getElementById('btn-demo'),
    timeline: document.getElementById('mission-timeline'),
    logsContainer: document.getElementById('live-logs-container'),
    rcaAnalysis: document.getElementById('rca-analysis'),
    rcaPlan: document.getElementById('rca-plan'),
    rcaTimeDetected: document.getElementById('rca-time-detected'),
    rcaTimeHealed: document.getElementById('rca-time-healed'),
    rcaDownloadBtn: document.getElementById('rca-download-btn'),
    globalStatus: document.getElementById('global-status-indicator'),
    cloudMap: {
      lambda: document.getElementById('cloud-map-lambda'),
      watch: document.getElementById('cloud-map-watch'),
      sns: document.getElementById('cloud-map-sns'),
      brain: document.getElementById('cloud-map-brain'),
    },
    agentGraph: {
      Orchestrator: document.getElementById('agent-graph-Orchestrator'),
      DeployAgent: document.getElementById('agent-graph-DeployAgent'),
      MonitorAgent: document.getElementById('agent-graph-MonitorAgent'),
      ReasoningAgent: document.getElementById('agent-graph-ReasoningAgent'),
      HealAgent: document.getElementById('agent-graph-HealAgent'),
    },
    demoModeIndicator: document.getElementById('demo-mode-indicator'),
    footerStatus: document.getElementById('footer-status'),
    cloudConnectors: document.getElementById('cloud-connectors'),
    eventsPlayground: document.getElementById('events-playground')
  };

  // Button handlers
  elements.btnDeploy.addEventListener('click', sendGoal);
  elements.btnSimulate.addEventListener('click', simulateFailure);
  elements.btnDemo.addEventListener('click', toggleDemoMode);

  // Playground dev helpers
  window.injectEvent = function(type, detail = null) {
    let e = { ts: new Date().toISOString(), type, source: type.split('.')[0] || '', detail };
    window.__EVENTS__.push(e); allEvents.push(e); processEvent(e);
    reRender();
  };
  window.injectCustomEvent = function() {
    let val = document.getElementById('event-custom').value;
    if (!val) return;
    try {
      let e = JSON.parse(val);
      if (!e.ts) e.ts = new Date().toISOString();
      window.__EVENTS__.push(e); allEvents.push(e); processEvent(e);
      reRender();
    } catch { alert("Invalid event JSON"); }
  };

  // Welcome log
  renderLogEntry({
    ts: new Date().toISOString(),
    source: 'AURA',
    type: 'info',
    detail: 'Mission Control initialized. Ready for commands.'
  });

  // Start polling
  pollEvents();
  renderDemoMode();
  accessibilityCheck();
});

function toggleDemoMode() {
  DEMO_MODE = !DEMO_MODE;
  renderDemoMode();
  if (DEMO_MODE) seedDemoEvents();
}

function renderDemoMode() {
  elements.btnDemo.innerText = DEMO_MODE ? "Demo Mode: ON" : "Demo Mode: OFF";
  elements.btnDemo.setAttribute('aria-pressed', DEMO_MODE ? "true" : "false");
  elements.demoModeIndicator.innerHTML = DEMO_MODE ?
    '<strong>Demo Mode:</strong> Fake event stream. Controls are local and replayable.' : '';
  elements.eventsPlayground.style.display = DEMO_MODE ? 'block' : 'none';
}

// Demo event sequence when demo mode enabled
function seedDemoEvents() {
  DEMO_SEQUENCE = [
    { ts: new Date(Date.now()-60000).toISOString(), type: 'plan.start', source: 'Orchestrator', detail: "Goal: Deploy app" },
    { ts: new Date(Date.now()-59000).toISOString(), type: 'deploy.completed', source: 'DeployAgent', detail: "Deployment complete." },
    { ts: new Date(Date.now()-45000).toISOString(), type: 'alarm.received', source: 'MonitorAgent', detail: "High latency detected." },
    { ts: new Date(Date.now()-44000).toISOString(), type: 'reasoning.started', source: 'ReasoningAgent', detail: "Analyzing incident..." },
    { ts: new Date(Date.now()-43000).toISOString(), type: 'reasoning.completed', source: 'ReasoningAgent', detail: mockRCA() },
    { ts: new Date(Date.now()-41000).toISOString(), type: 'heal.started', source: 'HealAgent', detail: "Initiating self-healing." },
    { ts: new Date(Date.now()-40000).toISOString(), type: 'heal.completed', source: 'HealAgent', detail: "Incident resolved." }
  ];
  allEvents = []; window.__EVENTS__ = [];
  DEMO_SEQUENCE.forEach(e => { allEvents.push(e); window.__EVENTS__.push(e); processEvent(e); });
  reRender();
}

// Poll backend or push demo events
async function pollEvents() {
  if (DEMO_MODE) { reRender(); setTimeout(pollEvents, 1300); return; }
  try {
    const res = await fetch(`${ORCH_URL}/events`);
    if (!res.ok) throw new Error('events fetch failed');
    const list = await res.json();
    const newEvents = lastTs ? list.filter(ev => ev.ts > lastTs) : list.slice(-40);
    if (newEvents.length > 0) {
      lastTs = newEvents[newEvents.length - 1].ts;
      allEvents = [...allEvents, ...newEvents].slice(-200);
      window.__EVENTS__ = allEvents.slice();
      newEvents.forEach(processEvent);
      reRender();
    }
  } catch (e) {
    renderLogEntry({ ts: new Date().toISOString(), source: 'Dashboard', type: 'error', detail: 'Failed to connect to orchestrator. Retrying...' });
  }
  setTimeout(pollEvents, 1200);
}

// POST /goal with goal
async function sendGoal() {
  elements.btnDeploy.disabled = true;
  elements.btnDeploy.innerText = 'Deploying...';
  let body = { goal: elements.goalInput.value };
  if (DEMO_MODE) { window.injectEvent('plan.start', body); return; }
  try {
    await fetch(`${ORCH_URL}/goal`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  } catch (e) { renderLogEntry({ ts: new Date().toISOString(), source: 'Dashboard', type: 'error', detail: 'Failed to connect to orchestrator.' }); }
}

async function simulateFailure() {
  if (DEMO_MODE) { window.injectEvent('alarm.received', "Simulated alarm."); return; }
  try {
    await fetch(`${ORCH_URL}/simulate`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' });
  } catch (e) { renderLogEntry({ ts: new Date().toISOString(), source: 'Dashboard', type: 'error', detail: 'Failed to connect to orchestrator.' }); }
}

function processEvent(ev) {
  renderLogEntry(ev); // log UI
  // Agent Graph SVG pulse
  if (ev.source && elements.agentGraph[ev.source]) flashAgent(ev.source);
  // Global status indicator update
  switch(ev.type) {
    case 'plan.start':
      elements.globalStatus.className = 'status-warn'; elements.btnDeploy.disabled = true; elements.btnDeploy.innerText = 'Running...'; break;
    case 'alarm.received':
      elements.globalStatus.className = 'status-danger'; break;
    case 'heal.completed':
      elements.globalStatus.className = ''; elements.btnDeploy.disabled = false; elements.btnDeploy.innerText = '🚀 Deploy'; break;
  }
}

function renderLogEntry(ev) {
  // Severity
  let sev = Object.keys(sevMap).find(key => (ev.type && ev.type.includes(key)) || (ev.source && ev.source.includes(key))) || 'info';
  let entry = document.createElement('div');
  entry.className = `log-entry log-sev-${sev}`;
  entry.innerHTML = `
    <div class="log-time">${new Date(ev.ts).toLocaleTimeString()}</div>
    <div style="flex:1"><div class="log-source">${ev.source || ev.type}</div>
    <div class="log-detail">${typeof ev.detail === 'string' ? ev.detail : JSON.stringify(ev.detail)}</div></div>
  `;
  elements.logsContainer.appendChild(entry);
  elements.logsContainer.scrollTop = elements.logsContainer.scrollHeight;
}

// Re-render UI panels if demo or update happens
function reRender() {
  renderTimeline(allEvents);
  renderRCA(allEvents);
  updateCloudMap(allEvents);
}

// TIMELINE
function renderTimeline(allEvents) {
  const steps = [
    { key: 'plan.start', label: 'Goal Received' },
    { key: 'deploy.completed', label: 'Deploy Complete' },
    { key: 'alarm.received', label: 'Alarm Detected' },
    { key: 'reasoning.started', label: 'AI Analysis' },
    { key: 'heal.started', label: 'Healing Initiated' },
    { key: 'heal.completed', label: 'Incident Resolved' }
  ];
  let have = key => allEvents.some(e => e.type === key || e.source === key);
  let activeIndex = -1;
  for (let i = steps.length - 1; i >= 0; i--) if (have(steps[i].key)) { activeIndex = i; break; }
  let html = '';
  steps.forEach((s,i) => {
    let done = i < activeIndex;
    let active = i === activeIndex;
    let failed = allEvents.some(e => e.type.includes('failed') || e.type.includes('error'));
    let stateClass = '';
    if (active) stateClass = 'active';
    if (done) stateClass = 'done';
    if (failed && active) stateClass = 'failed';
    html += `
      <div class="timeline-step ${stateClass}">
        <div class="timeline-step-icon">${done ? '✓' : (active ? '...' : '')}</div>
        <div>${s.label}</div>
      </div>
    `;
  });
  elements.timeline.innerHTML = html;
}

// Mock RCA LLM summary generator (if rca event missing)
function mockRCA() {
  return {
    root_cause_analysis: "AI detected latency due to exhausted connection pool in service Lambda-1. Possible cause: sudden traffic spike.",
    remediation_plan: "Automated scaling was triggered & stale connections refreshed. AI monitoring enabled for further anomalies."
  };
}

// RCA Panel
function renderRCA(allEvents) {
  const rcaEvent = [...allEvents].reverse().find(e => e.type === 'reasoning.completed')?.detail;
  const alarmEvent = [...allEvents].reverse().find(e => e.type === 'alarm.received');
  const healEvent = [...allEvents].reverse().find(e => e.type === 'heal.completed');
  if (alarmEvent) {
    elements.rcaTimeDetected.innerText = new Date(alarmEvent.ts).toLocaleTimeString();
    elements.rcaAnalysis.innerText = 'Awaiting AI analysis...';
    elements.rcaAnalysis.classList.add('placeholder');
    elements.rcaPlan.innerText = '—';
    elements.rcaPlan.classList.add('placeholder');
  }
  if (rcaEvent) {
    elements.rcaAnalysis.innerText = rcaEvent.root_cause_analysis || 'Analysis complete.';
    elements.rcaAnalysis.classList.remove('placeholder');
    elements.rcaPlan.innerText = rcaEvent.remediation_plan || 'Plan formulated.';
    elements.rcaPlan.classList.remove('placeholder');
  }
  if (healEvent) {
    elements.rcaTimeHealed.innerText = new Date(healEvent.ts).toLocaleTimeString();
    elements.rcaDownloadBtn.style.display = 'block';
  } else {
    elements.rcaTimeHealed.innerText = '—';
    elements.rcaDownloadBtn.style.display = 'none';
  }
}

// Cloud Map animation
function updateCloudMap(allEvents) {
  const last = allEvents[allEvents.length-1];
  if (!last) return;
  // Reset all
  Object.values(elements.cloudMap).forEach(el => el.classList.remove('active','alert','healed'));
  switch(last.type) {
    case 'plan.start': case 'deploy.completed':
      elements.cloudMap.lambda.classList.add('active'); break;
    case 'alarm.received':
      elements.cloudMap.watch.classList.add('alert'); elements.cloudMap.sns.classList.add('alert'); break;
    case 'reasoning.started':
      elements.cloudMap.brain.classList.add('active'); break;
    case 'heal.completed':
      elements.cloudMap.lambda.classList.add('healed'); break;
  }
}

// Pulse an Agent Graph node on event
function flashAgent(agentName) {
  const el = elements.agentGraph[agentName];
  if (!el) return;
  el.classList.add('pulse');
  setTimeout(() => el.classList.remove('pulse'), 900);
}

// --- Accessibility Checker (WCAG basics) ---
function accessibilityCheck() {
  // Focus rings for interactive elements
  document.querySelectorAll('button,[tabindex],textarea').forEach(el => {
    el.addEventListener('keyup', e => { if (e.key === "Tab") el.classList.add('focused'); });
    el.addEventListener('blur', () => el.classList.remove('focused'));
  });
  elements.footerStatus.innerHTML += ' | Accessibility: Basic WCAG focus/labels/ARIA live.';
}
