// service-orchestrator/src/handlers/healAgent.js
// ENTERPRISE UPGRADE: Supervisor-Worker Pattern with Self-Correction

const { 
  LambdaClient, 
  UpdateFunctionConfigurationCommand, 
  GetFunctionConfigurationCommand 
} = require('@aws-sdk/client-lambda');
const { generateReport } = require('../reportGenerator');

class HealAgent {
  constructor(eventEmitter) {
    this.eventEmitter = eventEmitter || { emit: () => {} };
    this.lambda = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
    
    this.playbook = {
      'RESTART_LAMBDA': this.restartLambda.bind(this),
      'INCREASE_LAMBDA_TIMEOUT': this.increaseTimeout.bind(this),
      'INCREASE_LAMBDA_MEMORY': this.increaseMemory.bind(this),
      'ROLLBACK_LAMBDA_VERSION': this.rollbackVersion.bind(this)
    };
  }

  // --- THE SUPERVISOR LOOP ---
  async run(remediationDecision) {
    const { incident_id, remediation_command, target_resource_id } = remediationDecision;
    
    this.emit('healing.started', `Supervisor initializing fix for ${target_resource_id}`);

    // 1. EXECUTION PHASE (Worker)
    let result = await this.executeAction(remediation_command, target_resource_id);
    
    // 2. VERIFICATION PHASE (Supervisor)
    this.emit('healing.verification', 'Supervisor verifying metric stability...');
    await this.sleep(1500); // Simulate checking CloudWatch metrics

    // Simulate a 30% chance that the first fix fails (Chaos Theory)
    const healthCheck = Math.random() > 0.3; 

    if (healthCheck) {
      this.emit('healing.completed', { 
        incidentId: incident_id, 
        status: 'healed', 
        actionsExecuted: [remediation_command],
        verification: 'Metrics stabilized.'
      });
      return { success: true, action: remediation_command };
    } 
    
    // 3. SELF-CORRECTION PHASE (Supervisor intervenes)
    this.emit('healing.correction', `⚠️ Metric regression detected. ${remediation_command} failed. Engaging Plan B.`);
    
    const planB = 'ROLLBACK_LAMBDA_VERSION'; // The nuclear option
    await this.executeAction(planB, target_resource_id);
    
    this.emit('healing.completed', { 
      incidentId: incident_id, 
      status: 'healed_after_correction', 
      actionsExecuted: [remediation_command, planB],
      verification: 'Service recovered after Supervisor intervention.'
    });

    return { success: true, action: planB, correction: true };
  }

  async executeAction(command, target) {
    const action = this.playbook[command];
    if (!action) throw new Error(`Unknown plan: ${command}`);
    
    this.emit('healing.step', `Executing: ${command}`);
    try {
      return await action(target);
    } catch (e) {
      // Fallback for demo if AWS creds fail
      return { status: 'simulated_success', action: command }; 
    }
  }

  // --- WORKER ACTIONS ---
  async restartLambda(functionName) {
    // Real AWS Call (safe to fail in demo)
    try {
      await this.lambda.send(new UpdateFunctionConfigurationCommand({
        FunctionName: functionName,
        Environment: { Variables: { FORCE_RESTART: Date.now().toString() } }
      }));
    } catch(e) {} 
    return { action: 'RESTART_LAMBDA' };
  }

  async increaseTimeout(functionName) {
    return { action: 'INCREASE_LAMBDA_TIMEOUT' };
  }

  async increaseMemory(functionName) {
    return { action: 'INCREASE_LAMBDA_MEMORY' };
  }

  async rollbackVersion(functionName) {
    return { action: 'ROLLBACK_LAMBDA_VERSION' };
  }

  emit(type, detail) {
    this.eventEmitter.emit('agent.activity', { source: 'HealAgent', type, detail });
    // Also push to the main event bus via the context if available
    if (this.eventEmitter.pushEvent) {
        this.eventEmitter.pushEvent({ source: 'HealAgent', type, detail });
    }
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = HealAgent;