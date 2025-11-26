/* FILENAME: src/api/DashboardApi.js
  PURPOSE: Specialized API for the React Frontend (Streaming & Graphs)
*/

const express = require('express');
const router = express.Router();
const EnterpriseSecurity = require('../middleware/Enterprise_Security_Policy');

// 1. Agent Thought Streaming (Server-Sent Events)
// Allows the UI to show "Thinking..." -> "Diagnosing..." -> "Acting..." in real time
router.get('/stream/agent-thoughts', EnterpriseSecurity.enforce('read:events'), (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendThought = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Send initial handshake
  sendThought({ type: 'connected', msg: 'Listening to Agent Thought Stream...' });

  // In a real app, you would hook into the EventEmitter here
  // For demo, we simulate a thought stream
  let step = 0;
  const steps = [
    { type: 'thought', msg: 'Ingesting CloudWatch Alarm: CPU_HIGH' },
    { type: 'thought', msg: 'Querying Vector DB for past incidents...' },
    { type: 'thought', msg: 'Found 3 matching runbooks.' },
    { type: 'decision', msg: 'Plan formulated: Restart Instance (Confidence: 98%)' }
  ];

  const interval = setInterval(() => {
    if (step < steps.length) {
      sendThought(steps[step]);
      step++;
    } else {
      clearInterval(interval);
      // Keep connection open for new events
    }
  }, 1000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

// 2. Incident Graph Topology
// Returns the visual structure of the infrastructure for the UI graph view
router.get('/topology', EnterpriseSecurity.enforce('read:reports'), (req, res) => {
  res.json({
    nodes: [
      { id: 'aws-lambda-1', type: 'compute', status: 'healthy', provider: 'aws' },
      { id: 'aws-rds-1', type: 'database', status: 'warning', provider: 'aws' },
      { id: 'azure-app-1', type: 'compute', status: 'healthy', provider: 'azure' }
    ],
    edges: [
      { source: 'aws-lambda-1', target: 'aws-rds-1' }
    ]
  });
});

module.exports = router;