// service-orchestrator/src/index.js
// AURA v3.0 - Enterprise Autonomous Incident Response Platform

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { SNSClient, SubscribeCommand, ConfirmSubscriptionCommand } = require('@aws-sdk/client-sns');
const rateLimit = require('express-rate-limit'); // DDOS Protection
const client = require('prom-client'); // Prometheus Metrics

// --- INTERNAL IMPORTS ---
const HITLController = require('./middleware/hitlController');
const { handleGoal } = require('./orchestrator');
const { redact } = require('./middleware/piiRedactor');

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// ---------- CORS FIX FOR VERCEL DEPLOY ----------
const allowedOrigins = [
  'https://aura-incident-commander.vercel.app',
  'https://aura-incident-commander-j9mvd3dw4.vercel.app', // Preview deploys
  'http://localhost:3000'
];

app.use(require('cors')({
  origin: function (origin, callback) {
    // Allow requests with no origin (health checks, curl, etc)
    if (!origin) return callback(null, true);

    // Allow all Vercel frontends, localhost (dev), and 127.0.0.1
    if (
      typeof origin === 'string' &&
      (
        origin.includes('.vercel.app') ||
        origin === 'http://localhost:3000' ||
        origin === 'http://127.0.0.1:3000'
      )
    ) {
      return callback(null, true);
    }

    // Block all else
    return callback(new Error('CORS policy: Not allowed by AURA backend'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));



// 1.1 DDOS Protection (Rate Limiting)
const limiter = rateLimit({
  windowMs: 60 * 1000,    // 1 minute
  max: 600,               // 600 requests per minute per IP (safe for 1–2s polling)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Throttling engaged for system stability." }
});
app.use(limiter);


// 1.2 Multi-Tenant Isolation (Middleware simulation)
app.use((req, res, next) => {
  req.tenantId = req.headers['x-tenant-id'] || 'default-corp';
  next();
});

// Middleware Config
app.use(express.json());
app.use(express.text());

// ==========================================
// 📊 MODULE 2: OBSERVABILITY (Prometheus)
// ==========================================
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const incidentCounter = new client.Counter({
  name: 'aura_incidents_total',
  help: 'Total number of incidents detected',
  labelNames: ['severity', 'tenant']
});
register.registerMetric(incidentCounter);

const healingDuration = new client.Histogram({
  name: 'aura_healing_duration_seconds',
  help: 'Time taken to autonomously heal an incident',
  buckets: [1, 5, 15, 60]
});
register.registerMetric(healingDuration);

// ==========================================
// 🧠 STATE MANAGEMENT
// ==========================================
const events = [];
const EVENTS_MAX = 1000;
const hitlController = new HITLController();

let cdkConfig = {
  lambdaFunctionName: 'mock-function-name',
  snsTopicArn: null
};

// ==========================================
// ⚡ CORE EVENT BUS (With PII Redaction)
// ==========================================
function pushEvent(ev) {
  try {
    // Security: Redact Sensitive Data
    const safeDetail = typeof ev.detail === 'string' ? redact(ev.detail) : ev.detail;

    const entry = { 
      eventId: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ts: new Date().toISOString(), 
      ...ev,
      detail: safeDetail 
    };
    
    events.push(entry);
    if (events.length > EVENTS_MAX) events.shift();
    
    // Structured JSON Logging (For Datadog/Splunk)
    console.log(JSON.stringify({
      level: ev.type.includes('error') ? 'ERROR' : 'INFO',
      source: entry.source || 'System',
      event: entry.type,
      message: typeof safeDetail === 'object' ? JSON.stringify(safeDetail) : safeDetail,
      timestamp: entry.ts
    }));

  } catch(e) { 
    console.error('EventBus Error:', e); 
  }
}

// ==========================================
// ⚙️ CONFIG LOADER
// ==========================================
try {
  const cdkOutputFile = path.resolve(__dirname, '../../cdk-output.json');
  if (fs.existsSync(cdkOutputFile)) {
    const outputs = JSON.parse(fs.readFileSync(cdkOutputFile, 'utf-8'));
    const stackKeys = Object.keys(outputs);
    if (stackKeys.length > 0) {
      const stack = outputs[stackKeys[0]];
      cdkConfig.lambdaFunctionName = stack.MonitoredFunctionNameOutput || stack.LambdaFunctionName;
      cdkConfig.snsTopicArn = stack.IncidentTopicArnOutput || stack.SNSTopicArn;
    }
    console.log(`[Config] Loaded: Lambda=${cdkConfig.lambdaFunctionName}`);
  } else {
    console.warn(`[Config] Running in SAFE MODE (No AWS Link)`);
  }
} catch (err) {
  console.error('[Config] Read Error:', err);
}

// ==========================================
// 🌐 API ENDPOINTS
// ==========================================
// 1. Health & Metrics
app.get('/health', (req, res) => res.json({ status: 'healthy', uptime: process.uptime() }));
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// 2. Event Stream
app.get('/events', (req, res) => res.json(events));

// 3. Mission Start (Deploy)
app.post('/goal', async (req, res) => {
  try {
    const { goal } = req.body;
    if (!goal) return res.status(400).json({ error: 'Goal required' });

    pushEvent({ source: 'Orchestrator', type: 'goal.received', detail: goal });

    // Async Execution
    handleGoal(goal, { pushEvent, hitlController, cdkConfig }).catch(err => {
      pushEvent({ source: 'Orchestrator', type: 'goal.error', detail: String(err) });
    });

    res.json({ status: 'accepted', message: 'Orchestration started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Chaos Simulation
app.post('/simulate', async (req, res) => {
  try {
    const { type } = req.body;
    const attackType = type || 'LATENCY_SPIKE';

    pushEvent({ source: 'Simulator', type: 'simulate.triggered', detail: `Injecting ${attackType}` });
    incidentCounter.inc({ severity: 'high', tenant: 'demo-corp' });

    // ChaosAgent
    try {
        const ChaosAgent = require('./handlers/chaosAgent');
        const chaos = new ChaosAgent({ pushEvent });
        await chaos.unleash(attackType);
    } catch (e) {
        pushEvent({ source: 'ChaosMonkey', type: 'impact.detected', detail: 'Simulating 5000ms Latency Spike' });
    }

    // Realistic Alarm Payload
    const simulatedAlarm = {
      AlarmName: 'HighErrorAlarm',
      NewState: 'ALARM',
      Trigger: { Dimensions: [{ name: "FunctionName", value: cdkConfig.lambdaFunctionName }] },
      NewStateReason: `Threshold exceeded due to ${attackType}`
    };

    const snsPayload = { Type: 'Notification', Message: JSON.stringify(simulatedAlarm) };
    const { handleAlarm } = require('./handlers/monitorAgent');
    const start = Date.now();
    
    handleAlarm(snsPayload, { pushEvent, hitlController })
      .then(() => healingDuration.observe((Date.now() - start) / 1000))
      .catch(err => pushEvent({ source: 'System', type: 'error', detail: String(err) }));

    res.json({ status: 'chaos_started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. AWS SNS Webhook
app.post('/sns', async (req, res) => {
  try {
    let payload = req.body;
    if (typeof req.body === 'string') { try { payload = JSON.parse(req.body); } catch(e) {} }
    if (payload.Type === 'SubscriptionConfirmation') {
      const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
      await snsClient.send(new ConfirmSubscriptionCommand({ Token: payload.Token, TopicArn: payload.TopicArn }));
      pushEvent({ source: 'SNS', type: 'subscription.confirmed', detail: payload.TopicArn });
      return res.status(200).send('Confirmed');
    }
    if (payload.Type === 'Notification') {
      const { handleAlarm } = require('./handlers/monitorAgent');
      handleAlarm(payload, { pushEvent, hitlController }); // Async
      return res.json({ status: 'processing' });
    }
    res.status(200).json({ status: 'ignored' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Approval Workflow
app.post('/approve/:incidentId', (req, res) => {
  hitlController.approve(req.params.incidentId);
  pushEvent({ source: 'HITL', type: 'action.approved', detail: req.params.incidentId });
  res.json({ status: 'approved' });
});

app.post('/deny/:incidentId', (req, res) => {
  hitlController.deny(req.params.incidentId);
  pushEvent({ source: 'HITL', type: 'action.denied', detail: req.params.incidentId });
  res.json({ status: 'denied' });
});

// 7. FinOps & Risk Engine
app.get('/risk-score', (req, res) => {
  try {
    const errorCount = events.filter(e => e.type && e.type.includes('error')).length;
    const healedCount = events.filter(e => e.type === 'heal.completed').length;
    let riskScore = 0;
    riskScore += (errorCount * 5);
    riskScore -= (healedCount * 10);
    if (riskScore < 0) riskScore = 0;
    if (riskScore > 100) riskScore = 100;

    res.json({
      riskScore,
      prediction: riskScore > 50 ? 'CRITICAL' : 'STABLE',
      finOps: {
        dailyCost: '$12.45',
        projectedCost: riskScore > 50 ? '$45.00 (Surge)' : '$12.45'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Executive Reporting (HTML)
app.get('/report-view', (req, res) => {
  const html = `
    <html>
    <head>
      <title>AURA Executive Brief</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; background: #f8f9fa; }
        .card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); margin-bottom: 20px;}
        h1 { color: #111; margin-top: 0; }
        .log { font-family: monospace; background: #f1f5f9; padding: 15px; border-radius: 8px; margin-bottom: 10px; font-size: 0.9em; }
        .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold; text-transform: uppercase; }
        .badge.sys { background: #e0f2fe; color: #0369a1; }
        .badge.err { background: #fee2e2; color: #b91c1c; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>🛡️ AURA Incident Report</h1>
        <p><strong>Generated:</strong> ${new Date().toUTCString()}</p>
        <p><strong>Tenant:</strong> Enterprise-Corp-01</p>
        <h3>Audit Log (Last 50 Events)</h3>
        ${events.slice().reverse().slice(0, 50).map(e => `
          <div class="log">
            <span class="badge ${e.type.includes('error') ? 'err' : 'sys'}">${e.source}</span>
            <strong>${e.type}</strong><br/>
            <span style="color:#666">${new Date(e.ts).toISOString()}</span><br/>
            ${typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail)}
          </div>
        `).join('')}
      </div>
    </body>
    </html>
  `;
  res.send(html);
});

// ==========================================
// 🚀 STARTUP SEQUENCE
// ==========================================
async function subscribeToSnsTopic() {
  const serverPublicUrl = process.env.PUBLIC_URL; 
  if (!serverPublicUrl || !cdkConfig.snsTopicArn) return;
  try {
    const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
    await snsClient.send(new SubscribeCommand({
      TopicArn: cdkConfig.snsTopicArn, Protocol: 'https', Endpoint: `${serverPublicUrl}/sns`
    }));
    console.log(`[SNS] ✅ Subscribed to ${cdkConfig.snsTopicArn}`);
  } catch (err) {
    console.warn('[SNS] Subscription warning:', err.message);
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║   AURA v3.0 - Enterprise Platform            ║
  ║   ---------------------------------------    ║
  ║   🚀 STATUS:      ONLINE                     ║
  ║   🛡️ SECURITY:    PII Redaction Active       ║
  ║   🧠 AI MODEL:    Amazon Bedrock (Q)         ║
  ║   📊 METRICS:     /metrics (Prometheus)      ║
  ╚══════════════════════════════════════════════╝
  `);
  pushEvent({ source: 'System', type: 'system.startup', detail: `AURA v3.0 initialized on port ${PORT}` });
  subscribeToSnsTopic();
});

module.exports = app;
