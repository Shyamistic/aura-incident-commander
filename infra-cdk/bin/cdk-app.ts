#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { IncidentCommanderStack } from '../lib/incident-commander-stack';

const app = new cdk.App();
new IncidentCommanderStack(app, 'IncidentCommanderStack', {
  env: { region: process.env.CDK_DEFAULT_REGION || 'us-east-1' }
});
