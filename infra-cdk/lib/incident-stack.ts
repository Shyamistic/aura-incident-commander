// infra-cdk/lib/incident-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';

export class IncidentCommanderStack extends cdk.Stack {
  public readonly incidentTopic: sns.Topic;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- 1. Create the Incident Notification Topic (SNS) ---
    this.incidentTopic = new sns.Topic(this, 'IncidentTopic', {
      displayName: 'Autonomous Incident Commander Alarm Topic',
    });

    new cdk.CfnOutput(this, 'IncidentTopicArnOutput', {
      value: this.incidentTopic.topicArn,
      exportName: 'IncidentCommanderTopicArn',
    });

    // --- 2. Create the Deployable, Monitored Resource (Lambda) ---
    const monitoredFunction = new lambda.Function(this, 'MonitoredFunction', {
      runtime: lambda.Runtime.NODEJS_18_X, 
      handler: 'index.handler',
      code: lambda.Code.fromInline(
        'exports.handler = async (event) => { console.log("Success"); return { statusCode: 200 }; };'
      ),
      timeout: cdk.Duration.seconds(3), // Start with a low timeout
      environment: {
        "LAST_RESTART_TIME": new Date().toISOString()
      }
    });

    new cdk.CfnOutput(this, 'MonitoredFunctionNameOutput', {
      value: monitoredFunction.functionName,
      exportName: 'IncidentCommanderFunctionName',
    });

    // --- 3a. Create the CloudWatch Error Alarm ---
    const errorMetric = monitoredFunction.metricErrors({
      period: cdk.Duration.minutes(1),
    });

    const highErrorAlarm = new cloudwatch.Alarm(this, 'HighErrorAlarm', {
      metric: errorMetric,
      threshold: 0, 
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Alarm for MonitoredFunction errors > 0',
      alarmName: 'HighErrorAlarm' // Explicitly name it
    });

    highErrorAlarm.addAlarmAction(new actions.SnsAction(this.incidentTopic));
    highErrorAlarm.addOkAction(new actions.SnsAction(this.incidentTopic));
    
    // --- 3b. Create the CloudWatch Timeout Alarm ---
    const timeoutMetric = monitoredFunction.metricThrottles({ // NOTE: Throttles is used as a stand-in for Timeouts
      period: cdk.Duration.minutes(1),
    });

    const highTimeoutAlarm = new cloudwatch.Alarm(this, 'HighTimeoutAlarm', {
      metric: timeoutMetric,
      threshold: 0, // Greater than 0 timeouts
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Alarm for MonitoredFunction timeouts > 0',
      alarmName: 'HighTimeoutAlarm' // Explicitly name it
    });

    // --- 4b. Wire the NEW Alarm to the SAME SNS Topic ---
    highTimeoutAlarm.addAlarmAction(new actions.SnsAction(this.incidentTopic));
    highTimeoutAlarm.addOkAction(new actions.SnsAction(this.incidentTopic));
  }
}