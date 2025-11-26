// service-orchestrator/src/orchestrator.js
// FIXED: Passing String instead of Object

const deployAgent = require('./handlers/deployAgent');

async function handleGoal(goalText, ctx = {}) {
  const pushEvent = ctx.pushEvent || (() => {});
  
  // Log the start
  pushEvent({ source: 'Orchestrator', type: 'plan.start', detail: goalText });

  try {
    // 1. Run Deploy Agent
    // FIX: We pass 'goalText' (String) directly. 
    // The previous version passed an object, which caused the .toLowerCase() crash.
    let result;
    
    // Check if it's a module with a static run function or a Class
    if (deployAgent.run) {
        result = await deployAgent.run(goalText, ctx);
    } else {
        // Fallback if it's a Class structure
        const agentInstance = new deployAgent(ctx);
        result = await agentInstance.run(goalText);
    }

    // If deploy failed, we stop
    if (!result || !result.success) {
      const msg = result.error || 'Deploy failed';
      pushEvent({ source: 'Orchestrator', type: 'plan.failed', detail: msg });
      return { status: 'failed' };
    }
    
    // 2. Activate Monitor Agent (Passive)
    pushEvent({ source: 'MonitorAgent', type: 'monitor.started', detail: 'Now monitoring for alarms...' });
    
    pushEvent({ source: 'Orchestrator', type: 'plan.complete', detail: 'Infrastructure successfully provisioned.' });
    return { status: 'ok' };
    
  } catch (err) {
    console.error('Orchestrator Error:', err);
    // Send a string detail to avoid [Object object] logs
    pushEvent({ source: 'Orchestrator', type: 'plan.failed', detail: String(err.message) });
    return { status: 'failed' };
  }
}

module.exports = { handleGoal };