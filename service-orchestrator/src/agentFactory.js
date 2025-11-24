// service-orchestrator/src/agentFactory.js
/**
 * AgentFactory: Unified provider for multi-cloud agents
 * Loads and routes to the correct cloud provider agent based on configuration
 */

const AwsHealAgent = require('./agents/aws/AwsHealAgent');
const GcpHealAgent = require('./agents/gcp/GcpHealAgent');
const AzureHealAgent = require('./agents/azure/AzureHealAgent');

class AgentFactory {
  static getHealAgent(provider = 'AWS', ctx = {}) {
    const normalizedProvider = (provider || 'AWS').toUpperCase();

    switch (normalizedProvider) {
      case 'AWS':
        return new AwsHealAgent(ctx);
      case 'GCP':
        return new GcpHealAgent(ctx);
      case 'AZURE':
        return new AzureHealAgent(ctx);
      default:
        console.warn(`[AgentFactory] Unknown provider: ${provider}, defaulting to AWS`);
        return new AwsHealAgent(ctx);
    }
  }

  static getAvailableProviders() {
    return ['AWS', 'GCP', 'Azure'];
  }

  static isValidProvider(provider) {
    return this.getAvailableProviders()
      .map(p => p.toUpperCase())
      .includes((provider || '').toUpperCase());
  }
}

module.exports = AgentFactory;