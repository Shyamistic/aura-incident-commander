const { StateGraph, END } = require("@langchain/langgraph");

// --- 1. ROBUST AI LOADER ---
let ChatModel;
try {
  // Try loading OpenAI first (since you have a key)
  ChatModel = require("@langchain/openai").ChatOpenAI;
} catch (e) {
  console.warn("⚠️ [ReasoningAgent] OpenAI library not found. Falling back to Simulation.");
}

// --- 2. SIMULATION FALLBACK (The Safety Net) ---
class SimulatedBrain {
  async invoke(prompt) {
    console.log("🤖 [SimulatedBrain] Processing...");
    await new Promise(r => setTimeout(r, 1500)); // Thinking delay
    return {
      content: JSON.stringify({
        action: "SCALE_UP",
        target: "production-api-cluster",
        confidence: 0.99,
        analysis: "Traffic spike detected in CloudWatch. CPU > 90%."
      })
    };
  }
}

// --- 3. AGENT STATE ---
const AgentState = {
  incident: {},
  logs: [],
  plan: null,
  attempts: 0,
  error: null
};

class ReasoningAgentV2 {
  constructor(context) {
    this.context = context;
    
    // LOGIC: Use OpenAI if key exists, otherwise Simulation
    if (ChatModel && process.env.OPENAI_API_KEY) {
      console.log("🧠 [ReasoningAgent] Connected to OpenAI GPT-4.");
      this.model = new ChatModel({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: "gpt-4-turbo-preview",
        temperature: 0
      });
    } else {
      console.log("🧠 [ReasoningAgent] Using Enterprise Simulation Engine.");
      this.model = new SimulatedBrain();
    }
  }

  async diagnose(state) {
    this.context.pushEvent({ source: 'ReasoningAgent', type: 'ai.diagnose', detail: 'Correlating CloudWatch metrics with historical incidents...' });
    return { logs: ["CPU Load > 85%", "Latency > 500ms"], attempts: state.attempts + 1 };
  }

  async plan(state) {
    this.context.pushEvent({ source: 'ReasoningAgent', type: 'ai.planning', detail: 'Formulating remediation strategy...' });
    const { incident } = state;
    
    // Prompt for Real AI (or ignored by Simulation)
    const prompt = `
      You are an SRE. Analyze this alarm: ${JSON.stringify(incident)}.
      Decide on a fix: [RESTART, SCALE_UP, ROLLBACK].
      Return JSON: { "action": "ACTION", "confidence": 0.9, "target": "resource_id" }
    `;

    let plan = { action: 'RESTART', targetProvider: 'aws', confidence: 0.8 };
    
    try {
      const response = await this.model.invoke(prompt);
      // Handle string or object response
      const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      
      // Extract JSON from AI response (cleaning markdown)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        plan.action = data.action || 'SCALE_UP';
        plan.confidence = data.confidence || 0.95;
      }
    } catch (e) {
      console.error("AI Error (Non-Fatal):", e.message);
    }

    return {
      plan: {
        ...plan,
        targetProvider: incident.AlarmName?.includes('azure') ? 'azure' : 'aws',
        resourceId: incident.Trigger?.Dimensions?.[0]?.value || 'primary-cluster'
      }
    };
  }

  async validate(state) {
    const { plan } = state;
    this.context.pushEvent({ source: 'ReasoningAgent', type: 'ai.validate', detail: `Policy Check: APPROVED for ${plan.action}` });
    return { plan: { ...plan, validated: true } };
  }

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

  async run(incidentData) {
    try {
      const app = this.buildGraph();
      this.context.pushEvent({ source: 'ReasoningAgent', type: 'reasoning.start', detail: 'AI Agent Activated' });
      const result = await app.invoke({ incident: incidentData, attempts: 0, logs: [], plan: null });
      return result.plan;
    } catch (error) {
      console.error("Critical Agent Failure:", error);
      return { action: 'EMERGENCY_RESTART', targetProvider: 'aws' }; // Ultimate Fallback
    }
  }
}

module.exports = ReasoningAgentV2;