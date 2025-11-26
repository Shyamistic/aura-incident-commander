require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
// AWS SDK, Prometheus, and your internal logic as before
const { SNSClient, SubscribeCommand, ConfirmSubscriptionCommand } = require('@aws-sdk/client-sns');
const client = require('prom-client');
const HITLController = require('./middleware/hitlController');
const { handleGoal } = require('./orchestrator');
const { redact } = require('./middleware/piiRedactor');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Universal CORS: always allow no-origin, all vercel, all localhost
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Allow curl, Render health, Postman, browserless, etc.
    if (
      typeof origin === 'string' &&
      (
        origin.endsWith('.vercel.app')
        || origin === 'http://localhost:3000'
        || origin === 'http://127.0.0.1:3000'
      )
    ) return callback(null, true);
    console.error('Rejected CORS Origin:', origin);
    return callback(new Error('CORS policy: Not allowed by AURA backend'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));

// ===== Enterprise Security: HTTP headers hardening
app.use(helmet({
  // You can further fine-tune Helmet settings for complex apps
}));

// ===== Always-open health/metrics before rate-limiter
app.get('/health', (req, res) => res.json({ status: 'healthy', uptime: process.uptime() }));

// ===== (Enterprise) Readiness/Liveness endpoints
app.get('/ready', (req, res) => res.json({ ready: true }));
app.get('/version', (req, res) => res.json({ version: "AURA v3.0 Enterprise" }));

// ===== Enterprise API Rate-Limiting (after health endpoints)
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Throttling engaged for system stability." }
});
app.use(limiter);

// ===== Enterprise Body Parsing & Input Validation
app.use(express.json({ limit: '2mb' })); // limit payload size
app.use(express.text({ limit: '500kb' }));

// ===== Strict API Content-Type Enforcement
app.use((req, res, next) => {
  if (
    (req.method === "POST" || req.method === "PUT") && 
    !req.is('application/json') &&
    req.originalUrl !== "/sns"
  ) {
    return res.status(415).json({ error: "Unsupported Media Type. Use application/json." });
  }
  next();
});

// ===== Enterprise Privacy: request logging (redacted for PII)
app.use((req, res, next) => {
  // Redact all headers, log tenant only, omit cookies for privacy
  console.log(JSON.stringify({
    method: req.method,
    path: req.originalUrl,
    tenant: req.headers['x-tenant-id'] || 'default',
    useragent: req.headers['user-agent'] || ''
  }));
  next();
});

// ===== Observability: Prometheus metrics endpoints
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
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// ===== Auditing/Event Persistence (Enterprise)
const events = [];
const EVENTS_MAX = 3000; // Increase for audit logs
const hitlController = new HITLController();

let cdkConfig = {
  lambdaFunctionName: 'mock-function-name',
  snsTopicArn: null
};
function pushEvent(ev) {
  try {
    const safeDetail = typeof ev.detail === 'string' ? redact(ev.detail) : ev.detail;
    const entry = { 
      eventId: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ts: new Date().toISOString(), 
      ...ev,
      detail: safeDetail 
    };
    events.push(entry);
    if (events.length > EVENTS_MAX) events.shift();
    // Enterprise JSON Logging
    console.log(JSON.stringify({
      level: ev.type && ev.type.includes('error') ? 'ERROR' : 'INFO',
      source: entry.source || 'System',
      event: entry.type,
      message: typeof safeDetail === 'object' ? JSON.stringify(safeDetail) : safeDetail,
      timestamp: entry.ts
    }));
  } catch(e) { console.error('EventBus Error:', e);}
}

// ===== Enterprise Config Loader
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

// ===== Core API endpoints (as before)
app.get('/events', (req, res) => res.json(events));
app.post('/goal', async (req, res) => {
  try {
    const { goal } = req.body;
    if (!goal) return res.status(400).json({ error: 'Goal required' });
    pushEvent({ source: 'Orchestrator', type: 'goal.received', detail: goal });
    handleGoal(goal, { pushEvent, hitlController, cdkConfig }).catch(err => {
      pushEvent({ source: 'Orchestrator', type: 'goal.error', detail: String(err) });
    });
    res.json({ status: 'accepted', message: 'Orchestration started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/simulate', async (req, res) => {
  try {
    const { type } = req.body;
    const attackType = type || 'LATENCY_SPIKE';
    pushEvent({ source: 'Simulator', type: 'simulate.triggered', detail: `Injecting ${attackType}` });
    incidentCounter.inc({ severity: 'high', tenant: 'demo-corp' });
    try {
      const ChaosAgent = require('./handlers/chaosAgent');
      const chaos = new ChaosAgent({ pushEvent });
      await chaos.unleash(attackType);
    } catch (e) {
      pushEvent({ source: 'ChaosMonkey', type: 'impact.detected', detail: 'Simulating 5000ms Latency Spike' });
    }
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

app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  res.set('X-Request-ID', req.requestId);
  next();
});
// 8. GDPR Right to be Forgotten (stub)
app.delete('/user/delete', (req, res) => {
  // Simulate user/account redaction for GDPR
  pushEvent({ source: 'GDPR', type: 'user.deleted', detail: `RequestID:${req.requestId}` });
  res.json({ status: 'deleted' });
});
// 9. Dynamic feature flag endpoint for frontends
app.get('/feature-flags', (req, res) => {
  // In production, fetch flags from configs/database
  res.json({
    chaosMode: true,
    aiDecisionCards: true,
    piiredaction: true,
    hitl: true,
    prediction: 'production', // or 'dev'
  });
});
// 10. SSO/JWT Auth (stub, fill in for prod)
app.post('/auth/sso', (req, res) => {
  // In production, validate JWTs!
  res.json({ status: 'ok', ssoProvider: 'stub' });
});

// ===== Global error handler for audits and user safety
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ error: 'Internal AURA error: ' + String(err) });
});

// ======== STARTUP LOGIC FOR AGENT ORCHESTRATOR =========
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
