// service-orchestrator/src/clients/amazonQClient.js
// ENTERPRISE VERSION: RAG-Enabled & FinOps Aware

const { BedrockAgentRuntimeClient, InvokeAgentCommand } = require('@aws-sdk/client-bedrock-agent-runtime');
const KnowledgeBase = require('../services/knowledgeBase'); // RAG Integration

class AmazonQClient {
  constructor() {
    this.client = new BedrockAgentRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1'
    });
    this.agentId = process.env.AMAZON_Q_AGENT_ID;
    this.agentAliasId = process.env.AMAZON_Q_AGENT_ALIAS_ID;

    if (!this.agentId || !this.agentAliasId) {
        console.error('[AmazonQClient] FATAL: AMAZON_Q_AGENT_ID or AMAZON_Q_AGENT_ALIAS_ID is not set in .env');
        // We don't throw here to allow the app to start in "Mock" mode, 
        // but calls to this client will fail gracefully via the fallback.
    }
  }

  /**
   * Calls Amazon Q with RAG Context (SOPs) and FinOps constraints.
   */
  async analyzeIncident(alarmData) {
    // 1. RAG RETRIEVAL: Get relevant corporate policies
    const alarmName = alarmData.AlarmName || 'Unknown';
    const corporatePolicy = KnowledgeBase.getContext(alarmName);

    // 2. PROMPT ENGINEERING: Inject Context & Business Logic
    const prompt = `
You are an Enterprise Site Reliability Engineer (SRE) and FinOps Controller.

CONTEXT & CORPORATE SOPs (STRICTLY FOLLOW THESE):
${corporatePolicy}

INCIDENT DATA:
${JSON.stringify(alarmData, null, 2)}

YOUR TASK:
1. Analyze the root cause based on the Alarm Data.
2. Select ONE remediation plan from: [RESTART_LAMBDA, INCREASE_LAMBDA_TIMEOUT, INCREASE_LAMBDA_MEMORY, LOG_ONLY].
3. YOU MUST CITE the specific SOP ID (e.g., "SOP-001") that authorizes this action.
4. ESTIMATE the financial impact (e.g., "Increases compute cost by 2x").

OUTPUT JSON FORMAT ONLY:
{
  "root_cause_analysis": "...",
  "remediation_plan": "RESTART_LAMBDA",
  "policy_citation": "SOP-001",
  "financial_impact": "+$0.00 (Transient State Reset)"
}`;

    try {
      const command = new InvokeAgentCommand({
        agentId: this.agentId,
        agentAliasId: this.agentAliasId,
        sessionId: `incident-${Date.now()}`,
        inputText: prompt
      });

      console.log('[AmazonQClient] Invoking Agent with RAG Context...');
      const response = await this.client.send(command);
      
      let fullResponse = '';
      for await (const chunk of response.completion) {
        if (chunk.chunk?.bytes) {
          fullResponse += new TextDecoder().decode(chunk.chunk.bytes);
        }
      }
      
      console.log('[AmazonQClient] Received Raw Response.');
      
      // 3. PARSE & VALIDATE
      // Bedrock sometimes wraps JSON in markdown or text, so we extract the JSON object
      const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
          console.error('[AmazonQClient] Failed to parse JSON from agent response.');
          return this.intelligentFallback(alarmData, "AI response was not valid JSON.");
      }
      
      const parsedResponse = JSON.parse(jsonMatch[0]);
      parsedResponse.ai_provider = 'Amazon Q + RAG Knowledge';
      
      return parsedResponse;

    } catch (error) {
      console.error('[AmazonQClient] Error invoking agent:', error.message);
      return this.intelligentFallback(alarmData, error.message);
    }
  }

  /**
   * Fallback Rule Engine (if AI fails)
   */
  intelligentFallback(alarmData, errorMsg) {
    const alarmName = alarmData.AlarmName || '';
    let analysis = {
        root_cause_analysis: `AI Connectivity Error (${errorMsg}). Switched to deterministic fallback rules.`,
        remediation_plan: 'LOG_ONLY',
        policy_citation: 'SOP-FALLBACK-99',
        financial_impact: 'Unknown',
        ai_provider: 'Rule-Based Fallback'
    };

    if (alarmName.includes('Timeout') || alarmName.includes('Duration')) {
      analysis.root_cause_analysis += ` Pattern match: Timeout detected.`;
      analysis.remediation_plan = 'INCREASE_LAMBDA_TIMEOUT';
      analysis.financial_impact = '+10% Compute Cost';
    } else if (alarmName.includes('Error') || alarmName.includes('Failure')) {
      analysis.root_cause_analysis += ` Pattern match: Transient Failure.`;
      analysis.remediation_plan = 'RESTART_LAMBDA';
      analysis.financial_impact = 'Zero Cost';
    } else if (alarmName.includes('Memory')) {
      analysis.root_cause_analysis += ` Pattern match: OOM Exception.`;
      analysis.remediation_plan = 'INCREASE_LAMBDA_MEMORY';
      analysis.financial_impact = '+15% Compute Cost';
    }
    
    return analysis;
  }
}

module.exports = AmazonQClient;