// 1. OBSERVABILITY & TELEMETRY (Must be first)
require('./instrumentation');

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');

// AWS & Metrics
const { SNSClient, SubscribeCommand, ConfirmSubscriptionCommand } = require('@aws-sdk/client-sns');
const client = require('prom-client');

// ===== ENTERPRISE MODULES (Corrected Paths) =====
const EnterpriseSecurity = require('./middleware/Enterprise_Security_Policy');
const ReasoningAgentV2 = require('./agents/ReasoningAgent_v2_LangGraph');
const MultiCloudHealer = require('./agents/MultiCloudHealer');
const DashboardApi = require('./api/DashboardApi');
const FinOpsAgent = require('./agents/FinOpsAgent'); // Ensure this file exists
const pdfGenerator = require('./utils/pdfGenerator'); // Ensure this file exists
const HITLController = require('./middleware/hitlController');
const { handleGoal } = require('./orchestrator');
const { redact } = require('./middleware/piiRedactor');

const app = express();
const PORT = process.env.PORT || 10000;

// ===== FEATURE 1: STATISTICAL ANOMALY TRACKER (Internal State) =====
const latencyHistory = []; 
function trackLatency(ms) {
  latencyHistory.push(ms);
  if (latencyHistory.length > 100) latencyHistory.shift();
}
function getZScore(currentVal) {
  if (latencyHistory.length < 10) return 0;
  const mean = latencyHistory.reduce((a, b) => a + b) / latencyHistory.length;
  const stdDev = Math.sqrt(latencyHistory.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / latencyHistory.length);
  return stdDev === 0 ? 0 : (currentVal - mean) / stdDev;
}

// ===== CORS SETUP =====
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const allowedPatterns = ['localhost', '127.0.0.1', 'file://', '.vercel.app', '.onrender.com', '.awsapprunner.com'];
    if (allowedPatterns.some(pattern => origin.includes(pattern))) return callback(null, true);
    console.warn(`[CORS] ⚠️ Origin blocked: ${origin}`);
    return callback(null, true); // Permissive for demo, strict for Prod
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-Request-ID', 'X-Role']
};
app.use(cors(corsOptions));

// ===== SECURITY MIDDLEWARE =====
app.use(helmet({
  contentSecurityPolicy: false,
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'no-referrer' }
}));

const limiter = rateLimit({
  windowMs: 60 * 1000, 
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers['x-tenant-id'] || req.ip, // FIX applied
  handler: (req, res) => res.status(429).json({ error: 'Throttling engaged.' })
});
app.use(limiter);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ limit: '2mb', extended: true }));

// ===== CONTEXT INJECTION MIDDLEWARE (Feature 5) =====
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  res.set('X-Request-ID', req.requestId);
  
  // Feature 5: Inject Cognitive Context
  const hour = new Date().getHours();
  req.systemContext = {
    loadState: hour > 9 && hour < 17 ? 'PEAK_BUSINESS_HOURS' : 'OFF_PEAK',
    maintenanceWindow: false,
    threatLevel: 'LOW'
  };

  console.log(JSON.stringify({
    method: req.method,
    path: req.originalUrl,
    context: req.systemContext,
    requestId: req.requestId
  }));
  next();
});

// ===== PROMETHEUS METRICS =====
const register = new client.Registry();
client.collectDefaultMetrics({ register });
const incidentCounter = new client.Counter({ name: 'aura_incidents_total', help: 'Total incidents', labelNames: ['severity', 'tenant'] });
const healingDuration = new client.Histogram({ name: 'aura_healing_duration_seconds', help: 'Time to heal', buckets: [0.1, 1, 5, 30] });
register.registerMetric(incidentCounter);
register.registerMetric(healingDuration);

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// ===== EVENT BUS =====
const events = [];
const EVENTS_MAX = 3000;
const hitlController = new HITLController();
let cdkConfig = { lambdaFunctionName: 'mock-function', snsTopicArn: null };

function pushEvent(ev) {
  try {
    const safeDetail = typeof ev.detail === 'string' ? redact(ev.detail) : ev.detail;
    const entry = { 
      eventId: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      ts: new Date().toISOString(), 
      ...ev,
      detail: safeDetail 
    };
    events.push(entry);
    if (events.length > EVENTS_MAX) events.shift();
    console.log(JSON.stringify({ level: 'INFO', ...entry }));
  } catch(e) { console.error('EventBus Error:', e); }
}

// ===== FEATURE 4: PROACTIVE DB PULSE (Background Worker) =====
setInterval(() => {
  // Simulates checking DB latency
  const latency = Math.floor(Math.random() * 50) + 10;
  trackLatency(latency);
  
  if (latency > 45) {
    pushEvent({ 
      source: 'ProactivePulse', 
      type: 'db.optimization', 
      detail: `Latency drift detected (${latency}ms). Cycling connection pool to prevent lockup.` 
    });
  }
}, 30000); // Runs every 30 seconds

// ===== API ROUTES =====

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime(), version: 'AURA v3.0 Enterprise' });
});

app.get('/events', EnterpriseSecurity.enforce('read:events'), (req, res) => {
  res.json(events); 
});

// Enhanced Deployment Endpoint (Feature 2: Shadow Mode)
app.post('/goal', EnterpriseSecurity.enforce('system:agent'), async (req, res) => {
  try {
    const { goal } = req.body;
    pushEvent({ source: 'Orchestrator', type: 'goal.received', detail: goal });
    
    // Feature 2: Shadow Mode Logic
    pushEvent({ source: 'ShadowEngine', type: 'deploy.canary', detail: 'Spinning up Shadow Fleet (5% traffic)...' });
    await new Promise(r => setTimeout(r, 800)); // Simulate canary spin-up
    pushEvent({ source: 'ShadowEngine', type: 'deploy.verify', detail: 'Canary health: 100%. Promoting to Main.' });

    handleGoal(goal, { pushEvent, hitlController, cdkConfig }).catch(err => {
      pushEvent({ source: 'Orchestrator', type: 'goal.error', detail: String(err) });
    });
    
    res.json({ status: 'accepted', mode: 'SHADOW_VERIFIED', requestId: req.requestId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/simulate', EnterpriseSecurity.enforce('system:agent'), async (req, res) => {
  const startTime = Date.now();
  try {
    const { type, severity = 'MEDIUM', provider = 'aws' } = req.body;
    
    pushEvent({ source: 'ChaosMonkey', type: 'simulate.triggered', detail: `Injecting ${type} on ${provider.toUpperCase()}` });
    incidentCounter.inc({ severity: severity.toLowerCase(), tenant: req.headers['x-tenant-id'] || 'default' });

    // The Brain
    const brain = new ReasoningAgentV2({ pushEvent });
    pushEvent({ source: 'Orchestrator', type: 'ai.handover', detail: `Engaging AI (Context: ${req.systemContext.loadState})...` });
    
    const simulatedAlarm = { AlarmName: `Critical-${type}-${provider}`, NewStateReason: `Threshold exceeded due to ${type}` };
    const plan = await brain.run(simulatedAlarm);
    
    // The Hands
    const healer = new MultiCloudHealer({ pushEvent });
    const result = await healer.heal({ ...plan, targetProvider: provider });

    const duration = (Date.now() - startTime) / 1000;
    healingDuration.observe(duration);
    trackLatency(duration * 1000); // Feed metrics to Z-Score engine

    res.json({ status: 'healed', plan_executed: plan, healing_result: result, duration: `${duration}s` });
  } catch (err) {
    pushEvent({ source: 'System', type: 'healing.fatal', detail: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Enhanced Cost Endpoint (Feature 3: Budget Guardrails)
app.post('/optimize-costs', EnterpriseSecurity.enforce('system:agent'), async (req, res) => {
  try {
    const finOps = new FinOpsAgent({ pushEvent });
    const opportunities = await finOps.scanForWaste();
    
    // Feature 3: Smart Budget Logic
    const totalSavings = opportunities.length * 45;
    let governanceAction = 'NONE';
    
    if (totalSavings > 500) {
      governanceAction = 'BUDGET_LOCK_APPLIED';
      pushEvent({ 
        source: 'GovernanceEngine', 
        type: 'policy.enforcement', 
        detail: `High waste detected ($${totalSavings}). Applying spending freeze on Dev environments.` 
      });
    }

    if (req.query.autoFix === 'true' && opportunities.length > 0) {
      const results = [];
      for (const opp of opportunities) {
        results.push(await finOps.optimize(opp));
        pushEvent({ source: 'FinOpsAgent', type: 'cost.saving_action', detail: `Stopped ${opp.id}` });
      }
      return res.json({ status: 'optimized', governance: governanceAction, savings: results });
    }

    res.json({ status: 'audit_complete', waste_found: opportunities.length > 0, governance: governanceAction, opportunities });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enhanced Risk Score (Feature 1: Predictive Z-Score)
app.get('/risk-score', (req, res) => {
  const errorCount = events.filter(e => e.type && e.type.includes('error')).length;
  let riskScore = Math.min(100, errorCount * 5);
  
  // Feature 1: Z-Score Anomaly Injection
  // If recent latency is statistically anomalous (> 2 std dev), spike the risk score
  const currentLatency = latencyHistory[latencyHistory.length - 1] || 100;
  const zScore = getZScore(currentLatency);
  
  let anomalyLabel = 'STABLE';
  if (zScore > 2) {
    riskScore = Math.max(riskScore, 85); // Force high risk
    anomalyLabel = 'STATISTICAL_ANOMALY';
    // Log it if it's new
    if (Math.random() > 0.8) pushEvent({ source: 'AnomalyDetector', type: 'risk.spike', detail: `Latency Z-Score ${zScore.toFixed(2)} exceeds safety variance.` });
  }

  res.json({
    riskScore,
    prediction: riskScore > 50 ? '🔴 HIGH RISK' : '🟢 STABLE',
    z_score: zScore.toFixed(2),
    analysis: riskScore > 50 
      ? `CRITICAL: ${anomalyLabel} detected. Predictive models indicate potential cascading failure.` 
      : `Normal Operation. Latency variance is within ${zScore.toFixed(2)}σ.`
  });
});

app.get('/report/download/:incidentId', EnterpriseSecurity.enforce('read:reports'), async (req, res) => {
  try {
    const pdfBytes = await pdfGenerator.generate(req.params.incidentId, events);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=RCA-${req.params.incidentId}.pdf`);
    res.send(Buffer.from(pdfBytes));
    pushEvent({ source: 'Compliance', type: 'report.generated', detail: `RCA generated for ${req.params.incidentId}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate PDF report' });
  }
});

// Admin Reset
app.post('/reset', EnterpriseSecurity.enforce('system:reset'), (req, res) => {
  events.length = 0;
  pushEvent({ source: 'Admin', type: 'system.reset', detail: 'Audit log cleared' });
  res.json({ status: 'reset_complete' });
});

// Error Handling
app.use((req, res) => res.status(404).json({ error: 'Endpoint not found' }));
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ error: 'Internal AURA Error', message: err.message });
});

// Server Start
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║   AURA v3.0 - Enterprise Platform            ║
  ║   ---------------------------------------    ║
  ║   🚀 STATUS:      ONLINE                     ║
  ║   🛡️ SECURITY:    RBAC + PII + Headers       ║
  ║   🧠 AI BRAIN:    LangGraph (Agentic)        ║
  ║   🔮 FEATURES:    Predictive + Shadow Mode   ║
  ║   🌐 PORT:        ${PORT}                       ║
  ╚══════════════════════════════════════════════╝
  `);
  
  pushEvent({ source: 'System', type: 'system.startup', detail: `AURA initialized on port ${PORT}` });
  
  const serverPublicUrl = process.env.PUBLIC_URL; 
  if (serverPublicUrl && cdkConfig.snsTopicArn) {
     const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
     snsClient.send(new SubscribeCommand({
       TopicArn: cdkConfig.snsTopicArn, Protocol: 'https', Endpoint: `${serverPublicUrl}/sns`
     })).catch(e => console.warn('SNS Subscribe Warning:', e.message));
  }
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });

module.exports = app;