     Autonomous AWS Incident Commander - Local skeleton

     This archive contains a minimal skeleton for the hackathon MVP. Put this folder on your workstation and follow the Quickstart below.

     QUICKSTART (local development)

     1) Infra (CDK TypeScript)
- cd infra-cdk
- npm install
- npx cdk bootstrap
- npx cdk deploy --app "node bin/cdk-app.js" --require-approval never

     2) Start orchestrator
- cd service-orchestrator
- npm install
- export AWS_REGION=us-east-1
- export SAMPLE_FUNCTION_NAME=<deployed-function-name-from-cdk-output>
- node src/index.js

     3) Start frontend
- cd frontend
- npm install
- npm run dev

     NOTES
- After deploying the CDK stack note the AlertTopicArn output; subscribe your orchestrator's /sns HTTPS endpoint to the topic so CloudWatch alarms post to the orchestrator.
- Use the API Gateway /simulate endpoint printed as DemoApiUrlsimulate to invoke the Lambda with {"fail":true} and trigger the alarm.
