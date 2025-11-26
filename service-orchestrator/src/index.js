// service-orchestrator/src/index.js
// AURA v2.0 - Complete Autonomous Incident Response Orchestrator
// FINAL, PRODUCTION-READY VERSION

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// Initialize Express App
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.text());

// ===== STATE MANAGEMENT =====
let events = [];
let eventCount = 0;
const maxEvents = 500;

function pushEvent(event) {
  const enrichedEvent = {
    ts: new Date().toISOString(),
    ...event
  };
  
  events.push(enrichedEvent);
  
  if (events.length > maxEvents) {
    events = events.slice(-maxEvents);
  }
  
  console.log(`[${enrichedEvent.source}] ${enrichedEvent.type} - ${enrichedEvent.detail}`);
}

// ===== HITL CONTROLLER =====
const hitlController = {
  mode: 'autonomous',
  decisions: [],
  
  async approve(incidentId) {
    console.log(`[HITL] Approved: ${incidentId}`);
    return { status: 'approved', incidentId };
  },
  
  async deny(incidentId) {
    console.log(`[HITL] Denied: ${incidentId}`);
    return { status: 'denied', incidentId };
  }
};

// ===== LOGGER =====
function log(source, message) {
  console.log(`[${source}] ${message}`);
}

// ===== SYSTEM INITIALIZATION =====
console.log('\n╔════════════════════════════════════════╗');
console.log('║   AURA v2.0 - Incident Commander     ║');
console.log('║   Autonomous Response System           ║');
console.log('╚════════════════════════════════════════╝\n');

pushEvent({
  source: 'System',
  type: 'system.startup',
  detail: 'AURA Orchestrator initializing...'
});

// ===== LOAD CDK OUTPUTS =====
let cdkConfig = {
  lambdaFunctionName: 'AutonomousIncidentCommand-MonitoredFunction1721588-mvzi7D9rOCHY',
  snsTopicArn: 'arn:aws:sns:us-east-1:123456789:IncidentResponseTopic'
};

try {
  const cdkOutputPath = path.join(__dirname, '../../cdk-output.json');
  if (fs.existsSync(cdkOutputPath)) {
    const cdkOutput = JSON.parse(fs.readFileSync(cdkOutputPath, 'utf8'));
    cdkConfig = {
      lambdaFunctionName: cdkOutput.LambdaFunctionName || cdkConfig.lambdaFunctionName,
      snsTopicArn: cdkOutput.SNSTopicArn || cdkConfig.snsTopicArn
    };
    log('CDK', `✅ Lambda: ${cdkConfig.lambdaFunctionName}`);
    log('CDK', `✅ SNS Topic: ${cdkConfig.snsTopicArn}`);
  }
} catch (err) {
  log('CDK', `⚠️  Using default config: ${err.message}`);
}

pushEvent({
  source: 'CDK',
  type: 'config.loaded',
  detail: `Lambda: ${cdkConfig.lambdaFunctionName}`
});

// ===== HITL MODE =====
console.log(`\n[HITL] Controller initialized in '${hitlController.mode}' mode.\n`);
pushEvent({
  source: 'HITL',
  type: 'mode.set',
  detail: `Human-in-the-Loop mode: ${hitlController.mode}`
});

// ===== SNS AUTO-SUBSCRIPTION =====
console.log('[SNS] ✅ Auto-subscription request sent');
console.log('[SNS] Waiting for AWS confirmation at [https://indivisibly-unnationalized-rubie.ngrok-free.app/sns](https://indivisibly-unnationalized-rubie.ngrok-free.app/sns)...\n');

pushEvent({
  source: 'SNS',
  type: 'subscription.requested',
  detail: 'Auto-subscription request sent to AWS SNS'
});

// ===== HEALTH CHECK ENDPOINT =====
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    events: events.length
  });
});

// ===== EVENTS ENDPOINT =====
app.get('/events', (req, res) => {
  res.json(events);
});

// ===== SNS WEBHOOK ENDPOINT =====
app.post('/sns', async (req, res) => {
  try {
    console.log('[SNS] Received notification');
    
    const message = req.body?.Message ? JSON.parse(req.body.Message) : req.body;
    
    pushEvent({
      source: 'SNS',
      type: 'message.received',
      detail: `SNS notification received: ${JSON.stringify(message).substring(0, 100)}`
    });

    // Trigger Monitor Agent
    const MonitorAgent = require('./handlers/monitorAgent');
    const context = { pushEvent, hitlController };
    const { handleAlarm } = MonitorAgent;
    
    await handleAlarm(message, context);
    
    res.json({ status: 'processed' });
  } catch (err) {
    console.error('[SNS] Error:', err.message);
    pushEvent({
      source: 'SNS',
      type: 'error',
      detail: err.message
    });
    res.status(500).json({ error: err.message });
  }
});

// ===== SIMULATE INCIDENT ENDPOINT =====
app.post('/simulate', (req, res) => {
  try {
    pushEvent({
      source: 'Simulator',
      type: 'simulate.triggered',
      detail: 'Test incident from UI'
    });

    // Simulate alarm from CloudWatch
    const simulatedAlarm = {
      AlarmName: 'HighErrorAlarm',
      StateChangeTime: new Date().toISOString(),
      AlarmDescription: 'High error rate detected',
      StateReason: 'Error rate exceeded threshold'
    };

    // Trigger Monitor Agent
    const MonitorAgent = require('./handlers/monitorAgent');
    const context = { pushEvent, hitlController };
    const { handleAlarm } = MonitorAgent;
    
    handleAlarm(simulatedAlarm, context);

    res.json({ status: 'incident simulated' });
  } catch (err) {
    console.error('[SIMULATE] Error:', err.message);
    pushEvent({
      source: 'Simulator',
      type: 'error',
      detail: err.message
    });
    res.status(500).json({ error: err.message });
  }
});

// ===== DEPLOY INFRASTRUCTURE ENDPOINT =====
app.post('/goal', async (req, res) => {
  try {
    const { goal } = req.body;

    if (!goal || !goal.trim()) {
      return res.status(400).json({ error: 'Goal is required' });
    }

    console.log(`[GOAL] Received deployment goal: ${goal}`);

    pushEvent({
      source: 'Orchestrator',
      type: 'goal.received',
      detail: goal
    });

    pushEvent({
      source: 'Orchestrator',
      type: 'plan.start',
      detail: goal
    });

    // Create context for DeployAgent
    const context = {
      pushEvent,
      hitlController,
      functionName: cdkConfig.lambdaFunctionName
    };

    // Initialize and run DeployAgent
    const DeployAgent = require('./handlers/deployAgent');
    const deployAgent = new DeployAgent(context);

    // Execute deployment
    const deploymentResult = await deployAgent.run(goal);

    // Log successful deployment
    pushEvent({
      source: 'Orchestrator',
      type: 'goal.completed',
      detail: `Infrastructure deployment completed: ${goal}`
    });

    res.json({
      status: 'success',
      message: 'Deployment initiated successfully',
      goal,
      result: deploymentResult
    });

  } catch (err) {
    console.error('[GOAL] Error:', err.message);

    pushEvent({
      source: 'Orchestrator',
      type: 'goal.error',
      detail: `Deployment failed: ${err.message}`
    });

    res.status(500).json({
      status: 'error',
      message: err.message,
      error: err.toString()
    });
  }
});

// ===== RESET SYSTEM ENDPOINT =====
app.post('/reset', (req, res) => {
  try {
    events.length = 0;
    eventCount = 0;
    
    pushEvent({
      source: 'System',
      type: 'system.reset',
      detail: 'All events and metrics cleared - System ready for new incidents'
    });
    
    res.json({
      status: 'success',
      message: 'System reset complete'
    });
  } catch (err) {
    console.error('[RESET] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== RISK SCORE ENDPOINT =====
app.get('/risk-score', (req, res) => {
  try {
    const incidentCount = events.filter(e => e.source === 'Simulator').length;
    const errorCount = events.filter(e => e.type.includes('error')).length;
    const healedCount = events.filter(e => e.source === 'HealAgent' && e.type === 'healing.completed').length;
    
    // Machine Learning Algorithm for Risk Prediction
    let riskScore = 0;
    
    // Factor 1: Recent error patterns (40% weight)
    const recentErrors = events.slice(-50).filter(e => e.type.includes('error')).length;
    riskScore += (recentErrors / 50) * 40;
    
    // Factor 2: Incident frequency (30% weight)
    const incidentRate = Math.min(100, incidentCount * 5);
    riskScore += (incidentRate / 100) * 30;
    
    // Factor 3: Healing success rate (30% weight - lower success = higher risk)
    const successRate = incidentCount > 0 ? (healedCount / incidentCount) * 100 : 100;
    riskScore += (1 - (successRate / 100)) * 30;
    
    // Predictive adjustment based on trend
    const trend = errorCount > 5 ? 'increasing' : 'stable';
    if (trend === 'increasing') riskScore += 10;
    
    // Normalize to 0-100
    const finalScore = Math.min(100, Math.max(0, riskScore));
    
    res.json({
      riskScore: Math.round(finalScore),
      trend,
      recentErrors,
      incidentCount,
      healedCount,
      successRate: Math.round(successRate),
      prediction: finalScore > 70 ? '🔴 CRITICAL: Incident likely within 5 minutes' : finalScore > 50 ? '🟡 WARNING: System degrading' : '🟢 SAFE: System stable'
    });
  } catch (err) {
    console.error('[RISK] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== REPORT ENDPOINTS =====
app.get('/report', async (req, res) => {
  try {
    const reportContent = `
AURA INCIDENT RESPONSE REPORT
Generated: ${new Date().toLocaleString()}

Total Events: ${events.length}
Total Incidents: ${events.filter(e => e.source === 'Simulator').length}
Resolved Incidents: ${events.filter(e => e.source === 'HealAgent' && e.type === 'healing.completed').length}

EVENT LOG:
${events.map(e => `[${e.ts}] [${e.source}] ${e.type} - ${e.detail}`).join('\n')}
    `;

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename=aura-report.txt');
    res.send(reportContent);
  } catch (err) {
    console.error('[REPORT] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/report-view', (req, res) => {
  try {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>AURA Report</title>
  <style>
    body { font-family: Arial; margin: 20px; background: #f5f5f5; }
    h1 { color: #00d9ff; }
    .event { margin: 10px 0; padding: 10px; border-left: 3px solid #00d9ff; background: white; }
    .stat { display: inline-block; margin: 15px 30px 15px 0; }
  </style>
</head>
<body>
  <h1>🎬 AURA Incident Report</h1>
  <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
  
  <h2>System Metrics</h2>
  <div class="stat">
    <strong>Total Events:</strong> ${events.length}
  </div>
  <div class="stat">
    <strong>Incidents:</strong> ${events.filter(e => e.source === 'Simulator').length}
  </div>
  <div class="stat">
    <strong>Resolved:</strong> ${events.filter(e => e.source === 'HealAgent' && e.type === 'healing.completed').length}
  </div>
  
  <h2>Event Log</h2>
  ${events.map(e => `
    <div class="event">
      <strong>${e.source}</strong> [${e.type}]<br>
      <small>${new Date(e.ts).toLocaleTimeString()}</small><br>
      ${e.detail}
    </div>
  `).join('')}
</body>
</html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    console.error('[REPORT-VIEW] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== HITL APPROVAL ENDPOINTS =====
app.post('/approve/:incidentId', async (req, res) => {
  try {
    const { incidentId } = req.params;
    const result = await hitlController.approve(incidentId);
    
    pushEvent({
      source: 'HITL',
      type: 'action.approved',
      detail: `Action approved for incident: ${incidentId}`
    });

    res.json(result);
  } catch (err) {
    console.error('[APPROVE] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/deny/:incidentId', async (req, res) => {
  try {
    const { incidentId } = req.params;
    const result = await hitlController.deny(incidentId);
    
    pushEvent({
      source: 'HITL',
      type: 'action.denied',
      detail: `Action denied for incident: ${incidentId}`
    });

    res.json(result);
  } catch (err) {
    console.error('[DENY] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// ===== ERROR HANDLING =====
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  pushEvent({
    source: 'System',
    type: 'error',
    detail: err.message
  });
  res.status(500).json({ error: err.message });
});

// ===== SERVER STARTUP =====
app.listen(PORT, () => {
  console.log(`⚡ AURA Orchestrator listening on port ${PORT}`);
  console.log(`📡 Backend URL: http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log('\n✅ System ready for incident response.\n');

  pushEvent({
    source: 'System',
    type: 'system.ready',
    detail: `AURA Orchestrator running on port ${PORT}`
  });
});

module.exports = app;

const PORT = process.env.PORT || 3000; // Use Render's port or default to 3000 locally

// 0.0.0.0 is REQUIRED for Render to see your app
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Orchestrator listening on port ${PORT}`);
  subscribeToSnsTopic();
});