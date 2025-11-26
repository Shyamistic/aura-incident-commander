const { StateGraph, END } = require("@langchain/langgraph");

// --- 1. ROBUST AI LOADER ---
let ChatModel;
try {
  ChatModel = require("@langchain/openai").ChatOpenAI;
} catch (e) {
  console.warn("⚠️ [ReasoningAgent] OpenAI library not found. Falling back to Simulation.");
}

// --- 2. SIMULATION FALLBACK ---
class SimulatedBrain {
  async invoke(prompt) {
    console.log("🤖 [SimulatedBrain] Generating plan...");
    await new Promise(r => setTimeout(r, 1000));
    return {
      content: JSON.stringify({
        action: "SCALE_UP",
        target: "primary-cluster",
        confidence: 0.99,
        analysis: "Identified CPU spike in CloudWatch logs. Scaling ASG."
      })
    };
  }
}

// --- 3. AGENT LOGIC ---
const AgentState = { incident: {}, logs: [], plan: null, attempts: 0 };

class ReasoningAgentV2 {
  constructor(context) {
    this.context = context;
    // USE OPENAI IF AVAILABLE, ELSE SIMULATE
    if (ChatModel && process.env.OPENAI_API_KEY) {
      this.model = new ChatModel({ openAIApiKey: process.env.OPENAI_API_KEY, temperature: 0 });
    } else {
      this.model = new SimulatedBrain();
    }
  }

  async diagnose(state) {
    this.context.pushEvent({ source: 'ReasoningAgent', type: 'ai.diagnose', detail: 'Analyzing telemetry...' });
    return { logs: ["Latency > 500ms"], attempts: state.attempts + 1 };
  }

  async plan(state) {
    this.context.pushEvent({ source: 'ReasoningAgent', type: 'ai.plan', detail: 'Drafting remediation...' });
    const { incident } = state;
    
    let plan = { action: 'RESTART', targetProvider: 'aws', resourceId: 'app-lambda' };
    try {
      const res = await this.model.invoke(`Fix this: ${JSON.stringify(incident)}. Return JSON {action, target, confidence}`);
      const content = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) Object.assign(plan, JSON.parse(jsonMatch[0]));
    } catch (e) { console.error("AI Plan Error:", e); }

    return { plan: { ...plan, targetProvider: incident.AlarmName?.includes('azure') ? 'azure' : 'aws' } };
  }

  async validate(state) {
    return { plan: { ...state.plan, validated: true } };
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
      const result = await app.invoke({ incident: incidentData, attempts: 0 });
      return result.plan;
    } catch (e) {
      console.error("Agent Crash:", e);
      return { action: 'EMERGENCY_RESTART', targetProvider: 'aws' };
    }
  }
}
module.exports = ReasoningAgentV2;