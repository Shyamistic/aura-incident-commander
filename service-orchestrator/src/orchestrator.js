// service-orchestrator/src/orchestrator.js
// CORRECTED PATHS

// Pointing to 'handlers' instead of 'agents'
const deployAgent = require('./handlers/deployAgent');

async function handleGoal(goalText, ctx = {}) {
  const pushEvent = ctx.pushEvent || (() => {});
  
  // Log the start
  pushEvent({ source: 'Orchestrator', type: 'plan.start', detail: goalText });

  // Define the mission
  const tasks = [
    { id: 'deploy', agent: 'DeployAgent', input: { app: 'sample-lambda' } },
    { id: 'monitor', agent: 'MonitorAgent', input: { app: 'sample-lambda' } },
  ];

  const results = [];
  
  try {
    // 1. Run Deploy Agent
    // We assume the agent exports a 'run' function or is an object with 'run'
    // Adjusting based on your deployAgent.js structure
    let result;
    if (deployAgent.run) {
        result = await deployAgent.run(tasks[0].input, { pushEvent });
    } else {
        // Fallback if it's a class
        const agentInstance = new deployAgent(ctx);
        result = await agentInstance.run(tasks[0].input);
    }

    results.push(result);
    
    // If deploy failed, we stop
    if (!result || !result.success) {
      pushEvent({ source: 'Orchestrator', type: 'plan.failed', detail: 'Deploy failed, stopping mission.' });
      return { status: 'failed', tasks: results };
    }
    
  } catch (err) {
    console.error('Orchestrator Error:', err);
    pushEvent({ source: 'Orchestrator', type: 'plan.failed', detail: String(err) });
    return { status: 'failed', tasks: results };
  }
  
  // 2. Activate Monitor Agent (Passive)
  pushEvent({ source: 'MonitorAgent', type: 'monitor.started', detail: 'Now monitoring for alarms...' });
  
  pushEvent({ source: 'Orchestrator', type: 'plan.complete', detail: results });
  return { status: 'ok', tasks: results };
}

module.exports = { handleGoal };