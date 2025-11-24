// service-orchestrator/src/clients/amazonQClient.js
// NEW FILE

const { BedrockAgentRuntimeClient, InvokeAgentCommand } = require('@aws-sdk/client-bedrock-agent-runtime');

class AmazonQClient {
  constructor() {
    this.client = new BedrockAgentRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1'
    });
    this.agentId = process.env.AMAZON_Q_AGENT_ID;
    this.agentAliasId = process.env.AMAZON_Q_AGENT_ALIAS_ID;

    if (!this.agentId || !this.agentAliasId) {
        console.error('[AmazonQClient] FATAL: AMAZON_Q_AGENT_ID or AMAZON_Q_AGENT_ALIAS_ID is not set in .env');
        throw new Error('Amazon Q client is not configured.');
    }
  }

  /**
   * Calls the Amazon Q Agent to analyze a raw CloudWatch alarm.
   */
  async analyzeIncident(alarmData) {
    // This prompt is engineered to force JSON output and select from our playbook
    const prompt = `You are an expert AWS SRE agent analyzing a production incident.
ALARM DATA:
${JSON.stringify(alarmData, null, 2)}

Your task:
1. Provide a "root_cause_analysis" (2-3 sentences).
2. Recommend ONE "remediation_plan" from this exact list: [RESTART_LAMBDA, INCREASE_LAMBDA_TIMEOUT, INCREASE_LAMBDA_MEMORY, LOG_ONLY]

Respond ONLY with valid JSON in this exact format:
{
  "root_cause_analysis": "...",
  "remediation_plan": "RESTART_LAMBDA"
}`;

    try {
      const command = new InvokeAgentCommand({
        agentId: this.agentId,
        agentAliasId: this.agentAliasId,
        sessionId: `incident-${Date.now()}`,
        inputText: prompt
      });

      console.log('[AmazonQClient] Invoking Amazon Q Agent...');
      const response = await this.client.send(command);
      
      let fullResponse = '';
      for await (const chunk of response.completion) {
        if (chunk.chunk?.bytes) {
          fullResponse += new TextDecoder().decode(chunk.chunk.bytes);
        }
      }
      
      console.log('[AmazonQClient] Received raw response:', fullResponse);
      
      // Clean the response (Bedrock often adds text before/after JSON)
      const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
          console.error('[AmazonQClient] Failed to parse JSON response from agent.');
          return this.intelligentFallback(alarmData, "AI response was not valid JSON.");
      }
      
      const parsedResponse = JSON.parse(jsonMatch[0]);
      parsedResponse.ai_provider = 'Amazon Q Developer';
      
      console.log('[AmazonQClient] Parsed analysis:', parsedResponse);
      return parsedResponse;

    } catch (error) {
      console.error('[AmazonQClient] Error invoking agent:', error.message);
      // If AI fails, use a rule-based fallback
      return this.intelligentFallback(alarmData, error.message);
    }
  }

  /**
   * A rule-based fallback if the Amazon Q call fails.
   * This ensures your app is still resilient.
   */
  intelligentFallback(alarmData, errorMsg) {
    const alarmName = alarmData.AlarmName || '';
    let analysis = {
        root_cause_analysis: `AI analysis failed (${errorMsg}). Using rule-based fallback.`,
        remediation_plan: 'LOG_ONLY',
        ai_provider: 'Rule-Based Fallback'
    };

    if (alarmName.includes('Timeout') || alarmName.includes('Duration')) {
      analysis.root_cause_analysis += ` Alarm name '${alarmName}' suggests a timeout.`;
      analysis.remediation_plan = 'INCREASE_LAMBDA_TIMEOUT';
    } else if (alarmName.includes('Error') || alarmName.includes('Failure')) {
      analysis.root_cause_analysis += ` Alarm name '${alarmName}' suggests a transient error.`;
      analysis.remediation_plan = 'RESTART_LAMBDA';
    } else if (alarmName.includes('Memory')) {
      analysis.root_cause_analysis += ` Alarm name '${alarmName}' suggests memory exhaustion.`;
      analysis.remediation_plan = 'INCREASE_LAMBDA_MEMORY';
    }
    
    console.warn('[AmazonQClient] Using fallback analysis:', analysis);
    return analysis;
  }
}

module.exports = AmazonQClient;