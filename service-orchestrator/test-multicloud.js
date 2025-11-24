const AgentFactory = require('./src/agentFactory');

async function testMultiCloud() {
  console.log('=== Testing Multi-Cloud Agents ===\n');

  // Test AWS
  const awsAgent = AgentFactory.getHealAgent('AWS');
  console.log('AWS Agent:', awsAgent.getProvider());
  const awsResult = await awsAgent.heal({
    remediation_command: 'LOG_ONLY',
    target_resource_id: 'test-aws-function'
  });
  console.log('AWS Result:', awsResult, '\n');

  // Test GCP
  const gcpAgent = AgentFactory.getHealAgent('GCP');
  console.log('GCP Agent:', gcpAgent.getProvider());
  const gcpResult = await gcpAgent.heal({
    remediation_command: 'RESTART_FUNCTION',
    target_resource_id: 'test-gcp-function'
  });
  console.log('GCP Result:', gcpResult, '\n');

  // Test Azure
  const azureAgent = AgentFactory.getHealAgent('Azure');
  console.log('Azure Agent:', azureAgent.getProvider());
  const azureResult = await azureAgent.heal({
    remediation_command: 'RESTART_FUNCTION',
    target_resource_id: 'test-azure-function'
  });
  console.log('Azure Result:', azureResult, '\n');
}

testMultiCloud().catch(console.error);
