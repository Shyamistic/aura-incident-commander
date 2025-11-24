// service-orchestrator/src/orchestrator.js
// ORCHESTRATOR - HANDLES /goal ENDPOINT

const { DeployAgent } = require('./agents/DeployAgent');

async function handleGoal(goal, context) {
  const { pushEvent, hitlController, functionName } = context;
  
  try {
    if (goal === 'deploy') {
      pushEvent({ source: 'Orchestrator', type: 'deploy.starting', detail: 'Initiating CDK deploy' });
      
      const deployAgent = new DeployAgent();
      const result = await deployAgent.deploy();
      
      pushEvent({ source: 'Orchestrator', type: 'deploy.completed', detail: result });
    } else {
      pushEvent({ source: 'Orchestrator', type: 'error', detail: `Unknown goal: ${goal}` });
    }
  } catch (err) {
    pushEvent({ source: 'Orchestrator', type: 'error', detail: err.message });
    throw err;
  }
}

module.exports = { handleGoal };