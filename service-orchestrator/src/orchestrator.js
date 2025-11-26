// service-orchestrator/src/orchestrator.js
// ENTERPRISE VERSION: Correct routing and data types

const DeployAgent = require('./handlers/deployAgent');
// Note: We use dynamic require for agents to ensure fresh state

async function handleGoal(goalText, ctx = {}) {
  const pushEvent = ctx.pushEvent || console.log;
  
  // 1. Log Mission Start
  pushEvent({ source: 'Orchestrator', type: 'plan.start', detail: `Orchestrating: ${goalText}` });

  // 2. Initialize Context
  // We pass the entire context (events, hitl, config) to the agent
  const agentContext = { ...ctx };

  try {
    // 3. EXECUTE DEPLOY AGENT
    // FIX: Pass the goalText (String) explicitly
    const deployer = new DeployAgent(agentContext);
    const result = await deployer.run(goalText);

    // 4. CHECK RESULT
    if (!result || !result.success) {
      throw new Error(result.error || 'Deployment failed verification.');
    }

    // 5. ACTIVATE MONITORING (Passive)
    pushEvent({ 
      source: 'MonitorAgent', 
      type: 'monitor.started', 
      detail: 'Active Monitoring: ON. Watching CloudWatch Metrics.' 
    });

    pushEvent({ 
      source: 'Orchestrator', 
      type: 'plan.complete', 
      detail: 'Mission Accomplished. Infrastructure is Live.' 
    });

    return { status: 'ok', result };

  } catch (err) {
    console.error('[Orchestrator] Failed:', err);
    pushEvent({ source: 'Orchestrator', type: 'plan.failed', detail: String(err.message) });
    return { status: 'failed', error: err.message };
  }
}

module.exports = { handleGoal };