/* FILENAME: src/agents/ReasoningAgent_v2_LangGraph.js
  PURPOSE: State Machine Agent (LangGraph) with RAG capabilities
*/

const { StateGraph, END } = require("@langchain/langgraph");
const { ChatBedrock } = require("@langchain/aws"); 
const { z } = require("zod");

// 1. Define the State of the Agent
const AgentState = {
  incident: {}, // Input data
  logs: [],     // Retrieved logs
  plan: null,   // The generated plan
  attempts: 0,  // Loop counter
  error: null
};

class ReasoningAgentV2 {
  constructor(context) {
    this.context = context;
    // Use AWS Bedrock (Claude 3 or Titan) as the brain
    this.model = new ChatBedrock({
      model: "anthropic.claude-3-sonnet-20240229-v1:0", 
      region: process.env.AWS_REGION || "us-east-1",
      // temperature: 0 // Deterministic for ops
    });
  }

  // --- NODE 1: DIAGNOSE ---
  async diagnose(state) {
    console.log("🧠 [Brain] Diagnosing...");
    // Mock RAG: In real life, query a Vector DB here
    const retrievedContext = "Runbook 42 says: If latency > 2s, check DB locks.";
    
    // In a real scenario, we would prompt the LLM here. 
    // For this code structure, we simulate the LLM's thought process.
    return { 
      logs: [retrievedContext],
      attempts: state.attempts + 1 
    };
  }

  // --- NODE 2: PLAN ---
  async plan(state) {
    console.log("🧠 [Brain] Planning remediation...");
    const { incident } = state;
    
    // Simple Heuristic Fallback if LLM fails
    let action = 'UNKNOWN';
    let provider = 'aws'; // Default to AWS from env

    if (incident.AlarmName?.includes('Lambda')) {
      action = 'RESTART';
      provider = 'aws';
    } else if (incident.AlarmName?.includes('Azure')) {
      action = 'RESTART';
      provider = 'azure';
    }

    return {
      plan: {
        action,
        targetProvider: provider,
        resourceId: incident.Trigger?.Dimensions?.[0]?.value || 'unknown-resource',
        confidence: 0.95
      }
    };
  }

  // --- NODE 3: VALIDATE (Guardrail) ---
  async validate(state) {
    console.log("🧠 [Brain] Validating against Policy...");
    const { plan } = state;
    
    // Check against the Enterprise Security Policy
    if (plan.action === 'DELETE_DB') {
      return { error: 'Security Veto: Deletion not allowed' };
    }
    return { plan: { ...plan, validated: true } };
  }

  // --- BUILD THE GRAPH ---
  buildGraph() {
    const workflow = new StateGraph({ channels: AgentState })
      .addNode("diagnose", this.diagnose.bind(this))
      .addNode("plan", this.plan.bind(this))
      .addNode("validate", this.validate.bind(this))
      
      .addEdge("diagnose", "plan")
      .addEdge("plan", "validate")
      .setEntryPoint("diagnose");

    return workflow.compile();
  }

  // --- EXECUTE ---
  async run(incidentData) {
    const app = this.buildGraph();
    
    this.context.pushEvent({
      source: 'ReasoningAgentV2',
      type: 'reasoning.started',
      detail: 'Initializing LangGraph Workflow'
    });

    const result = await app.invoke({
      incident: incidentData,
      attempts: 0,
      logs: [],
      plan: null
    });

    if (result.error) {
       this.context.pushEvent({ source: 'ReasoningAgentV2', type: 'reasoning.blocked', detail: result.error });
       throw new Error(result.error);
    }

    return result.plan;
  }
}

module.exports = ReasoningAgentV2;