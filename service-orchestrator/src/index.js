// service-orchestrator/src/index.js
// AURA v2.0 - Complete Autonomous Incident Response Orchestrator
// FINAL, PRODUCTION-READY VERSION

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { SNSClient, SubscribeCommand, ConfirmSubscriptionCommand } = require('@aws-sdk/client-sns');

// --- INTERNAL IMPORTS ---
// We use dynamic requires inside routes to prevent circular dependency issues during startup
const HITLController = require('./middleware/hitlController');
const { handleGoal } = require('./orchestrator');

// Initialize Express App
const app = express();

// Define PORT immediately to avoid ReferenceErrors
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.text()); // Handle raw text SNS payloads

// ===== STATE MANAGEMENT =====
const events = [];
const EVENTS_MAX = 500;

// Initialize Controller
const hitlController = new HITLController();

// Config Placeholder
let cdkConfig = {
  lambdaFunctionName: 'mock-function-name',
  snsTopicArn: null
};

// ===== HELPER FUNCTIONS =====

function pushEvent(ev) {
  try {
    const entry = { 
      ts: new Date().toISOString(), 
      ...ev 
    };
    events.push(entry);
    
    // Keep log size manageable
    if (events.length > EVENTS_MAX) events.shift();
    
    // Console log for debugging (cleaner output)
    const detailStr = typeof entry.detail === 'object' ? JSON.stringify(entry.detail) : entry.detail;
    console.log(`[${entry.source || 'System'}] ${entry.type} - ${detailStr.substring(0, 100)}...`);
  } catch(e) { 
    console.error('pushEvent error:', e); 
  }
}

// ===== LOAD CONFIGURATION =====
try {
  const cdkOutputFile = path.resolve(__dirname, '../../cdk-output.json');
  if (fs.existsSync(cdkOutputFile)) {
    const outputs = JSON.parse(fs.readFileSync(cdkOutputFile, 'utf-8'));
    // Try to find the function name and topic ARN in the output
    const stackKeys = Object.keys(outputs);
    if (stackKeys.length > 0) {
      const stack = outputs[stackKeys[0]];
      cdkConfig.lambdaFunctionName = stack.MonitoredFunctionNameOutput || stack.LambdaFunctionName;
      cdkConfig.snsTopicArn = stack.IncidentTopicArnOutput || stack.SNSTopicArn;
    }
    console.log(`[CDK] Config Loaded: Lambda=${cdkConfig.lambdaFunctionName}`);
  } else {
    console.warn(`[CDK] cdk-output.json not found. Running in safe mode.`);
  }
} catch (err) {
  console.error('[CDK] Error reading config:', err);
}

// ==========================================
// 🚀 ENDPOINTS
// ==========================================

// 1. HEALTH CHECK
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    events: events.length,
    mode: hitlController.mode
  });
});

// 2. GET EVENTS
app.get('/events', (req, res) => {
  res.json(events);
});

// 3. DEPLOY GOAL (Mission Start)
app.post('/goal', async (req, res) => {
  try {
    const { goal } = req.body;
    if (!goal) return res.status(400).json({ error: 'Goal is required' });

    console.log(`[GOAL] Received: ${goal}`);
    pushEvent({ source: 'Orchestrator', type: 'goal.received', detail: goal });

    // Run in background (do not await)
    handleGoal(goal, { pushEvent, hitlController, cdkConfig }).catch(err => {
      console.error('handleGoal background error', err);
      pushEvent({ source: 'Orchestrator', type: 'goal.error', detail: String(err) });
    });

    res.json({ status: 'ok', message: 'Deployment initiated' });
  } catch (err) {
    console.error('[GOAL] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 4. SIMULATE INCIDENT (Triggers Amazon Q)
app.post('/simulate', async (req, res) => {
  try {
    pushEvent({
      source: 'Simulator',
      type: 'simulate.triggered',
      detail: 'Test incident triggered from UI'
    });

    // Create a realistic CloudWatch Alarm payload
    const simulatedAlarm = {
      AlarmName: 'HighErrorAlarm',
      NewState: 'ALARM',
      StateChangeTime: new Date().toISOString(),
      Trigger: {
        Dimensions: [{ "name": "FunctionName", "value": cdkConfig.lambdaFunctionName }]
      },
      NewStateReason: 'Threshold exceeded (Simulated)'
    };

    // SNS Envelope
    const snsPayload = {
      Type: 'Notification',
      Message: JSON.stringify(simulatedAlarm)
    };

    // Trigger Monitor Agent
    const { handleAlarm } = require('./handlers/monitorAgent');
    handleAlarm(snsPayload, { pushEvent, hitlController }).catch(err => {
      console.error('simulate error:', err);
      pushEvent({ source: 'Simulator', type: 'error', detail: String(err) });
    });

    res.json({ status: 'incident simulated' });
  } catch (err) {
    console.error('[SIMULATE] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 5. SNS WEBHOOK (Real AWS Alerts)
app.post('/sns', async (req, res) => {
  try {
    let payload = req.body;
    if (typeof req.body === 'string') {
        try { payload = JSON.parse(req.body); } catch(e) {}
    }

    // Handle Subscription Confirmation
    if (payload.Type === 'SubscriptionConfirmation') {
      console.log('Received SNS Subscription Confirmation...');
      const { Token, TopicArn } = payload;
      const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
      const confirmCommand = new ConfirmSubscriptionCommand({ Token, TopicArn });
      await snsClient.send(confirmCommand);
      console.log('SUCCESS: SNS Subscription Confirmed.');
      pushEvent({ source: 'SNS', type: 'subscription.confirmed', detail: TopicArn });
      return res.status(200).send('Subscription Confirmed');
    }

    // Handle Notification
    if (payload.Type === 'Notification') {
        const { handleAlarm } = require('./handlers/monitorAgent');
        await handleAlarm(payload, { pushEvent, hitlController });
        res.json({ status: 'processed' });
    } else {
        res.status(200).json({ status: 'ignored' });
    }
  } catch (err) {
    console.error('[SNS] Error:', err.message);
    pushEvent({ source: 'SNS', type: 'error', detail: err.message });
    res.status(500).json({ error: err.message });
  }
});

// 6. HITL APPROVALS
app.post('/approve/:incidentId', async (req, res) => {
  try {
    const { incidentId } = req.params;
    hitlController.approve(incidentId);
    pushEvent({ source: 'HITL', type: 'action.approved', detail: incidentId });
    res.json({ status: 'approved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/deny/:incidentId', async (req, res) => {
  try {
    const { incidentId } = req.params;
    hitlController.deny(incidentId);
    pushEvent({ source: 'HITL', type: 'action.denied', detail: incidentId });
    res.json({ status: 'denied' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/pending-approvals', (req, res) => {
    res.json(Array.from(hitlController.pendingApprovals.entries()));
});

// 7. RESET SYSTEM
app.post('/reset', (req, res) => {
    events.length = 0;
    pushEvent({ source: 'System', type: 'system.reset', detail: 'System cleared.' });
    res.json({ status: 'success' });
});

// 8. RISK SCORE (Advanced Feature)
app.get('/risk-score', (req, res) => {
  try {
    const incidentCount = events.filter(e => e.source === 'Simulator' || e.type === 'alarm.received').length;
    const errorCount = events.filter(e => e.type && e.type.includes('error')).length;
    const healedCount = events.filter(e => e.type === 'heal.completed').length;
    
    // Risk Algorithm
    let riskScore = 0;
    
    // Factor 1: Errors (High weight)
    const recentErrors = events.slice(-50).filter(e => e.type && e.type.includes('error')).length;
    riskScore += (recentErrors * 10);
    
    // Factor 2: Unresolved Incidents
    const activeIncidents = Math.max(0, incidentCount - healedCount);
    riskScore += (activeIncidents * 25);
    
    // Normalize (0-100)
    const finalScore = Math.min(100, Math.max(0, riskScore));
    
    res.json({
      riskScore: finalScore,
      trend: errorCount > 2 ? 'increasing' : 'stable',
      details: { recentErrors, incidentCount, healedCount },
      prediction: finalScore > 70 ? 'CRITICAL' : finalScore > 30 ? 'WARNING' : 'SAFE'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. REPORT VIEW (HTML)
app.get('/report-view', (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>AURA Incident Report</title>
      <style>
        body { font-family: 'Segoe UI', Arial; margin: 0; padding: 40px; background: #f8f9fa; color: #333; }
        .container { background: white; max-width: 900px; margin: 0 auto; padding: 40px; border-radius: 12px; box-shadow: 0 5px 20px rgba(0,0,0,0.05); }
        h1 { color: #2c3e50; border-bottom: 2px solid #eee; padding-bottom: 20px; }
        .stats { display: flex; gap: 20px; margin-bottom: 30px; }
        .stat-card { background: #e9ecef; padding: 15px; border-radius: 8px; flex: 1; text-align: center; }
        .stat-val { font-size: 24px; font-weight: bold; display: block; }
        .event { padding: 15px 0; border-bottom: 1px solid #eee; }
        .event:last-child { border-bottom: none; }
        .ts { color: #888; font-size: 0.9em; margin-bottom: 5px; display: block; }
        .source { background: #e7f1ff; color: #007bff; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 0.8em; margin-right: 10px; }
        .detail { font-family: monospace; background: #f8f9fa; padding: 5px; border-radius: 4px; display: block; margin-top: 5px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📑 AURA Incident Report</h1>
        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        
        <div class="stats">
            <div class="stat-card">
                <span class="stat-val">${events.length}</span> Total Events
            </div>
            <div class="stat-card">
                <span class="stat-val">${events.filter(e => e.type === 'heal.completed').length}</span> Resolved
            </div>
             <div class="stat-card">
                <span class="stat-val">${events.filter(e => e.type && e.type.includes('error')).length}</span> Errors
            </div>
        </div>

        <h3>Audit Trail</h3>
        ${events.slice().reverse().map(e => `
          <div class="event">
            <span class="ts">${new Date(e.ts).toLocaleString()}</span>
            <div>
                <span class="source">${e.source}</span> 
                <strong>${e.type}</strong>
            </div>
            <span class="detail">${typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail)}</span>
          </div>
        `).join('')}
      </div>
    </body>
    </html>
  `;
  res.send(html);
});

// ==========================================
// 🚀 SERVER STARTUP (FIXED)
// ==========================================

// Helper for SNS Subscription on startup
async function subscribeToSnsTopic() {
  const serverPublicUrl = process.env.PUBLIC_URL; 
  if (!serverPublicUrl || !cdkConfig.snsTopicArn) {
    console.log('[SNS] Auto-Subscribe skipped (Missing URL or Topic ARN).');
    return;
  }
  
  try {
    const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
    const subscribeCommand = new SubscribeCommand({
      TopicArn: cdkConfig.snsTopicArn,
      Protocol: 'https', 
      Endpoint: `${serverPublicUrl}/sns`
    });
    await snsClient.send(subscribeCommand);
    console.log(`[SNS] ✅ Subscription requested for ${cdkConfig.snsTopicArn}`);
  } catch (err) {
    console.error('[SNS] Subscription Failed:', err.message);
  }
}

// Start the Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║   AURA v2.0 - Incident Commander     ║`);
  console.log(`║   Status: ONLINE                     ║`);
  console.log(`║   Port:   ${PORT}                       ║`);
  console.log(`║   Mode:   ${hitlController.mode.toUpperCase()}                 ║`);
  console.log(`╚════════════════════════════════════════╝\n`);
  
  // Initial System Events
  pushEvent({ source: 'System', type: 'system.startup', detail: `AURA Orchestrator v2.0 Online on port ${PORT}` });
  
  // Try to subscribe to SNS
  subscribeToSnsTopic();
});

module.exports = app;