// service-orchestrator/src/agents/BaseAgent.js
/**
 * Abstract base class for all cloud provider agents
 * Extends this for AWS, GCP, Azure, etc.
 */
class BaseAgent {
  constructor(ctx = {}) {
    this.ctx = ctx;
    this.provider = 'base';
  }

  /**
   * Monitor cloud resources for issues
   */
  async monitor(config) {
    throw new Error('monitor() not implemented in ' + this.constructor.name);
  }

  /**
   * Analyze incident/alarm data
   */
  async analyze(incident) {
    throw new Error('analyze() not implemented in ' + this.constructor.name);
  }

  /**
   * Heal/remediate a cloud resource
   */
  async heal(remediation) {
    throw new Error('heal() not implemented in ' + this.constructor.name);
  }

  /**
   * Test a resource (optional)
   */
  async test(resourceId) {
    console.log(`[${this.provider}] Test not implemented for ${resourceId}`);
    return { success: true, status: 'not-implemented' };
  }

  /**
   * Approve an action (optional, for HITL)
   */
  async approve(actionId, decision) {
    console.log(`[${this.provider}] Approve: ${actionId} = ${decision}`);
    return { success: true };
  }

  /**
   * Report generation (optional)
   */
  async report(incident, healResult) {
    console.log(`[${this.provider}] Report: incident ${incident.id}`);
    return { success: true };
  }

  /**
   * Utility: Get provider name
   */
  getProvider() {
    return this.provider;
  }
}

module.exports = BaseAgent;