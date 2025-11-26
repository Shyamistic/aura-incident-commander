/* FILENAME: src/agents/FinOpsAgent.js
   PURPOSE: The "Money Maker." Finds waste and eliminates it.
*/

const { EC2Client, DescribeInstancesCommand, StopInstancesCommand } = require('@aws-sdk/client-ec2');
const { CloudWatchClient, GetMetricStatisticsCommand } = require('@aws-sdk/client-cloudwatch');

class FinOpsAgent {
  constructor(context) {
    this.context = context;
    this.ec2 = new EC2Client({ region: process.env.AWS_REGION || 'us-east-1' });
    this.cw = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });
  }

  // The "Audit" - Finds money to save
  async scanForWaste() {
    this.context.pushEvent({ source: 'FinOpsAgent', type: 'scan.started', detail: 'Scanning for idle resources...' });
    
    // 1. Get all running EC2 instances
    const data = await this.ec2.send(new DescribeInstancesCommand({
      Filters: [{ Name: 'instance-state-name', Values: ['running'] }]
    }));

    const savingsOpportunities = [];

    for (const reservation of data.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        const isIdle = await this.checkIfIdle(instance.InstanceId);
        if (isIdle) {
          savingsOpportunities.push({
            id: instance.InstanceId,
            type: instance.InstanceType,
            estimatedSavings: '$45.00/mo', // Simplified calculation
            recommendation: 'STOP'
          });
        }
      }
    }

    if (savingsOpportunities.length > 0) {
      this.context.pushEvent({ 
        source: 'FinOpsAgent', 
        type: 'waste.detected', 
        detail: { count: savingsOpportunities.length, opportunities: savingsOpportunities } 
      });
      return savingsOpportunities;
    } else {
      this.context.pushEvent({ source: 'FinOpsAgent', type: 'scan.clean', detail: 'No waste detected.' });
      return [];
    }
  }

  // Helper: Check CPU utilization
  async checkIfIdle(instanceId) {
    // In real life: Check CloudWatch CPU < 2% for 1 hour
    // For Demo: Random chance of finding an idle server
    return Math.random() > 0.7; 
  }

  // The "Action" - Saves the money
  async optimize(opportunity) {
    if (opportunity.recommendation === 'STOP') {
      try {
        await this.ec2.send(new StopInstancesCommand({ InstanceIds: [opportunity.id] }));
        return { success: true, saved: opportunity.estimatedSavings };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
    return { success: false, error: 'Unknown action' };
  }
}

module.exports = FinOpsAgent;