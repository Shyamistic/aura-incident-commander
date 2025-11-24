import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';

export class IncidentCommanderStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const appFunction = new lambda.Function(this, 'SampleAppFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../lambda-app'),
      memorySize: 256
    });

    const alertTopic = new sns.Topic(this, 'AlertTopic');

    const errorMetric = appFunction.metricErrors({ period: cdk.Duration.minutes(1) });

    new cw.Alarm(this, 'AppErrorAlarm', {
      metric: errorMetric,
      evaluationPeriods: 1,
      threshold: 1,
    }).addAlarmAction({
      bind: () => ({
        alarmActionArn: alertTopic.topicArn
      })
    });

    new cdk.CfnOutput(this, 'AlertTopicArn', { value: alertTopic.topicArn });
    new cdk.CfnOutput(this, 'SampleAppFunctionName', { value: appFunction.functionName });

    const api = new apigw.RestApi(this, 'DemoApi', { restApiName: 'IncidentDemoApi' });

    const simulate = api.root.addResource('simulate');
    const simulateIntegration = new apigw.AwsIntegration({
      service: 'lambda',
      integrationHttpMethod: 'POST',
      path: `2015-03-31/functions/${appFunction.functionArn}/invocations`
    });
    simulate.addMethod('POST', simulateIntegration);

    new cdk.CfnOutput(this, 'DemoApiUrl', { value: api.url });
  }
}
