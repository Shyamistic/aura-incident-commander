// service-orchestrator/src/services/knowledgeBase.js
// RAG ENGINE: In-Memory Vector Store for Corporate SOPs

const SOP_DATABASE = [
  {
    id: 'SOP-001',
    topic: 'High Latency / Timeout',
    content: 'POLICY: For latency > 5s, verify database connection pool. If healthy, INCREASE_LAMBDA_TIMEOUT by 50%. DO NOT scale memory without approval.'
  },
  {
    id: 'SOP-002',
    topic: 'Memory Exhaustion / OOM',
    content: 'POLICY: If error log contains "Task timed out" or "Memory", check memory utilization. Remediation: INCREASE_LAMBDA_MEMORY to next tier (e.g. 512 -> 1024).'
  },
  {
    id: 'SOP-003',
    topic: 'Unknown Error / Crash',
    content: 'POLICY: For unclassified 5xx errors, attempt RESTART_LAMBDA to clear transient state. If error persists > 3 times, Escalate to Human.'
  },
  {
    id: 'SOP-004',
    topic: 'Cost Control',
    content: 'POLICY: Any scaling action that increases cost > $10/day requires HITL (Human-in-the-Loop) approval.'
  }
];

class KnowledgeBase {
  static getContext(alarmName) {
    // Simple semantic search simulation
    // In a real billion-dollar app, this would be a Vector DB query (Pinecone/Weaviate)
    
    const relevantSops = SOP_DATABASE.filter(sop => 
      alarmName.toLowerCase().includes('timeout') && sop.topic.includes('Timeout') ||
      alarmName.toLowerCase().includes('error') && sop.topic.includes('Unknown') ||
      alarmName.toLowerCase().includes('memory') && sop.topic.includes('Memory')
    );

    // Always include Cost Policy
    relevantSops.push(SOP_DATABASE.find(s => s.id === 'SOP-004'));

    return relevantSops.map(s => `[${s.id}] ${s.content}`).join('\n');
  }
}

module.exports = KnowledgeBase;