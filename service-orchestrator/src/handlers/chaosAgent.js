// service-orchestrator/src/handlers/chaosAgent.js
// CHAOS MONKEY: Intentionally disrupts services to test resilience

class ChaosAgent {
  constructor(ctx) {
    this.pushEvent = ctx.pushEvent || console.log;
  }

  async unleash(attackType = 'LATENCY_SPIKE') {
    this.pushEvent({ 
        source: 'ChaosMonkey', 
        type: 'attack.started', 
        detail: `⚠️ INJECTING FAULT: ${attackType}` 
    });

    // Simulate the "Blast Radius"
    await new Promise(r => setTimeout(r, 1000));

    let impact = '';
    switch(attackType) {
        case 'LATENCY_SPIKE':
            impact = 'API Response time degraded to 4500ms (Threshold: 1000ms)';
            break;
        case 'MEMORY_LEAK':
            impact = 'Heap usage spiked to 98% (OOM Imminent)';
            break;
        case 'DEPENDENCY_FAILURE':
            impact = 'Database Connection Pool Exhausted';
            break;
    }

    this.pushEvent({ 
        source: 'ChaosMonkey', 
        type: 'impact.detected', 
        detail: impact 
    });

    // Trigger the real alarm flow automatically
    return { 
        AlarmName: `Chaos-${attackType}`,
        NewStateReason: `Chaos Agent Injection: ${impact}`,
        Trigger: {
            Dimensions: [{ name: 'FunctionName', value: 'Production-Core' }]
        }
    };
  }
}

module.exports = ChaosAgent;