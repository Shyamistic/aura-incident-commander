// service-orchestrator/src/agents/aws/AwsHealAgent.js
/**
 * AWS-specific Heal Agent
 * Executes remediation actions on AWS Lambda, ECS, RDS, etc.
 */

const BaseAgent = require('../BaseAgent');
const {
  LambdaClient,
  UpdateFunctionConfigurationCommand,
  GetFunctionConfigurationCommand,
  ListAliasesCommand,
  UpdateAliasCommand
} = require('@aws-sdk/client-lambda');

class AwsHealAgent extends BaseAgent {
  constructor(ctx = {}) {
    super(ctx);
    this.provider = 'AWS';
    this.region = ctx.region || 'us-east-1';
    this.lambdaClient = new LambdaClient({ region: this.region });
  }

  /**
   * Main heal method - routes to specific remediation
   */
  async heal(remediation) {
    const { remediation_command, target_resource_id, incident_id } = remediation;

    console.log(`[${this.provider}HealAgent] Executing ${remediation_command} for ${target_resource_id}`);

    const playbook = {
      'RESTART_LAMBDA': () => this.restartLambda(target_resource_id),
      'INCREASE_LAMBDA_TIMEOUT': () => this.increaseLambdaTimeout(target_resource_id),
      'INCREASE_LAMBDA_MEMORY': () => this.increaseLambdaMemory(target_resource_id),
      'ROLLBACK_LAMBDA_VERSION': () => this.rollbackLambdaVersion(target_resource_id),
      'LOG_ONLY': () => this.logOnly(target_resource_id),
      'SCALE_ECS_TASK': () => this.scaleEcsTask(target_resource_id),
      'RESTART_RDS_DB': () => this.restartRdsDatabase(target_resource_id)
    };

    const handler = playbook[remediation_command];
    if (!handler) {
      throw new Error(`[${this.provider}] Unknown remediation command: ${remediation_command}`);
    }

    return await handler();
  }

  /**
   * Force Lambda cold start by updating environment variable
   */
  async restartLambda(functionName) {
    try {
      const command = new UpdateFunctionConfigurationCommand({
        FunctionName: functionName,
        Environment: {
          Variables: {
            'LAST_RESTART_TIME': new Date().toISOString()
          }
        }
      });

      const response = await this.lambdaClient.send(command);
      console.log(`[${this.provider}HealAgent] Lambda ${functionName} restart initiated`);

      return {
        success: true,
        provider: this.provider,
        action: 'RESTART_LAMBDA',
        functionName,
        response
      };
    } catch (err) {
      if (err.name === 'ResourceNotFoundException') {
        console.warn(`[${this.provider}HealAgent] Function ${functionName} not found, using fallback`);
        return {
          success: true,
          provider: this.provider,
          action: 'RESTART_LAMBDA_FALLBACK',
          functionName,
          message: 'Mock restart (function not found)'
        };
      }
      throw err;
    }
  }

  /**
   * Increase Lambda timeout (up to 900s)
   */
  async increaseLambdaTimeout(functionName) {
    try {
      const getCmd = new GetFunctionConfigurationCommand({ FunctionName: functionName });
      const config = await this.lambdaClient.send(getCmd);
      const currentTimeout = config.Timeout || 3;
      const newTimeout = Math.min(currentTimeout * 2, 900);

      if (newTimeout === currentTimeout) {
        return { success: true, action: 'INCREASE_LAMBDA_TIMEOUT', status: 'at_max', currentTimeout };
      }

      const updateCmd = new UpdateFunctionConfigurationCommand({
        FunctionName: functionName,
        Timeout: newTimeout
      });

      await this.lambdaClient.send(updateCmd);
      console.log(`[${this.provider}HealAgent] Lambda timeout: ${currentTimeout}s → ${newTimeout}s`);

      return {
        success: true,
        provider: this.provider,
        action: 'INCREASE_LAMBDA_TIMEOUT',
        functionName,
        oldValue: currentTimeout,
        newValue: newTimeout
      };
    } catch (err) {
      if (err.name === 'ResourceNotFoundException') {
        return { success: true, action: 'INCREASE_LAMBDA_TIMEOUT_FALLBACK', status: 'not_found' };
      }
      throw err;
    }
  }

  /**
   * Increase Lambda memory (up to 10240MB)
   */
  async increaseLambdaMemory(functionName) {
    try {
      const getCmd = new GetFunctionConfigurationCommand({ FunctionName: functionName });
      const config = await this.lambdaClient.send(getCmd);
      const currentMemory = config.MemorySize || 128;
      const newMemory = Math.min(currentMemory * 2, 10240);

      if (newMemory === currentMemory) {
        return { success: true, action: 'INCREASE_LAMBDA_MEMORY', status: 'at_max', currentMemory };
      }

      const updateCmd = new UpdateFunctionConfigurationCommand({
        FunctionName: functionName,
        MemorySize: newMemory
      });

      await this.lambdaClient.send(updateCmd);
      console.log(`[${this.provider}HealAgent] Lambda memory: ${currentMemory}MB → ${newMemory}MB`);

      return {
        success: true,
        provider: this.provider,
        action: 'INCREASE_LAMBDA_MEMORY',
        functionName,
        oldValue: currentMemory,
        newValue: newMemory
      };
    } catch (err) {
      if (err.name === 'ResourceNotFoundException') {
        return { success: true, action: 'INCREASE_LAMBDA_MEMORY_FALLBACK', status: 'not_found' };
      }
      throw err;
    }
  }

  /**
   * Rollback to previous Lambda version (stub for hackathon)
   */
  async rollbackLambdaVersion(functionName) {
    console.log(`[${this.provider}HealAgent] Rollback Lambda version: ${functionName} (stubbed)`);
    // In production, this would list published versions and update alias
    return {
      success: true,
      provider: this.provider,
      action: 'ROLLBACK_LAMBDA_VERSION',
      functionName,
      status: 'stubbed'
    };
  }

  /**
   * Scale ECS task (stub for now)
   */
  async scaleEcsTask(taskArn) {
    console.log(`[${this.provider}HealAgent] Scale ECS task: ${taskArn} (stubbed)`);
    return {
      success: true,
      provider: this.provider,
      action: 'SCALE_ECS_TASK',
      taskArn,
      status: 'stubbed'
    };
  }

  /**
   * Restart RDS database (stub for now)
   */
  async restartRdsDatabase(dbInstanceId) {
    console.log(`[${this.provider}HealAgent] Restart RDS DB: ${dbInstanceId} (stubbed)`);
    return {
      success: true,
      provider: this.provider,
      action: 'RESTART_RDS_DB',
      dbInstanceId,
      status: 'stubbed'
    };
  }

  /**
   * Log only - no action
   */
  async logOnly(resourceId) {
    console.log(`[${this.provider}HealAgent] LOG_ONLY: ${resourceId} - no action taken`);
    return {
      success: true,
      provider: this.provider,
      action: 'LOG_ONLY',
      resourceId
    };
  }
}

module.exports = AwsHealAgent;