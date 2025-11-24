// lib/incident-stack.ts

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';

export class IncidentCommanderStack extends cdk.Stack {
  // Public property to output the SNS Topic ARN
  public readonly incidentTopic: sns.Topic;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- 1. Create the Incident Notification Topic (SNS) ---
    // This is the topic your MonitorAgent will subscribe to.
    this.incidentTopic = new sns.Topic(this, 'IncidentTopic', {
      displayName: 'Autonomous Incident Commander Alarm Topic',
    });

    // Output the ARN so the DeployAgent can capture it
    new cdk.CfnOutput(this, 'IncidentTopicArnOutput', {
      value: this.incidentTopic.topicArn,
      exportName: 'IncidentCommanderTopicArn',
    });

    // --- 2. Create the Deployable, Monitored Resource (Lambda) ---
    const monitoredFunction = new lambda.Function(this, 'MonitoredFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      // Point to a simple local file that exports a handler
      code: lambda.Code.fromInline(
        'exports.handler = async (event) => { console.log("Success"); return { statusCode: 200 }; };'
      ),
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
    });

    // --- 3. Create the CloudWatch Alarm ---
    // Alarm: Triggers if the Lambda function has ANY errors for a 1-minute period.
    const errorMetric = monitoredFunction.metricErrors({
      period: cdk.Duration.minutes(1),
    });

    const highErrorAlarm = new cloudwatch.Alarm(this, 'HighErrorAlarm', {
      metric: errorMetric,
      threshold: 0, // Greater than 0 errors
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      // Configure the alarm to treat missing data as 'notBreaching' to avoid false positives
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Alarm for MonitoredFunction errors > 0',
    });

    // --- 4. Wire the Alarm to the SNS Topic ---
    // When the alarm state changes to ALARM, publish a message to the SNS topic.
    highErrorAlarm.addAlarmAction(new actions.SnsAction(this.incidentTopic));
    highErrorAlarm.addOkAction(new actions.SnsAction(this.incidentTopic));
  }
}