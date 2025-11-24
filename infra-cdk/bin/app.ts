// infra-cdk/bin/app.ts
import *as cdk from 'aws-cdk-lib';
import { IncidentCommanderStack } from '../lib/incident-stack'; // Imports the stack

const app = new cdk.App();
new IncidentCommanderStack(app, 'AutonomousIncidentCommanderStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});