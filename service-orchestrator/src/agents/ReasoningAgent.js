// service-orchestrator/src/agents/ReasoningAgent.js
// REASONING AGENT - COMPLETE FIX - EXPORTS AS CLASS

const fs = require('fs');
const path = require('path');

class ReasoningAgent {
  constructor(context) {
    this.context = context;
  }

  async analyze(alarmData, incidentId) {
    try {
      const { pushEvent } = this.context;
      
      pushEvent({
        source: 'ReasoningAgent',
        type: 'analysis.started',
        detail: `Analyzing incident: ${alarmData.AlarmName || 'Unknown'}`
      });

      // Analyze the alarm
      const analysis = {
        incidentId,
        alarmName: alarmData.AlarmName || 'Unknown',
        severity: this.determineSeverity(alarmData),
        rootCause: this.determineRootCause(alarmData),
        recommendedAction: this.getRecommendedAction(alarmData),
        timestamp: new Date().toISOString()
      };

      pushEvent({
        source: 'ReasoningAgent',
        type: 'analysis.completed',
        detail: JSON.stringify(analysis)
      });

      // Proceed to healing
      try {
        const HealAgent = require('../handlers/healAgent');
        const healAgent = new HealAgent(this.context);
        await healAgent.heal(analysis);
      } catch (healErr) {
        console.error('[ReasoningAgent] HealAgent error:', healErr.message);
        pushEvent({
          source: 'ReasoningAgent',
          type: 'warning',
          detail: `Healing skipped: ${healErr.message}`
        });
      }

      return analysis;
    } catch (err) {
      console.error('[ReasoningAgent] Error:', err.message);
      const { pushEvent } = this.context;
      pushEvent({
        source: 'ReasoningAgent',
        type: 'error',
        detail: err.message
      });
      throw err;
    }
  }

  determineSeverity(alarmData) {
    if (alarmData.AlarmName?.includes('Critical')) return 'critical';
    if (alarmData.AlarmName?.includes('Error')) return 'high';
    if (alarmData.AlarmName?.includes('Warning')) return 'medium';
    return 'low';
  }

  determineRootCause(alarmData) {
    const alarmName = alarmData.AlarmName || '';
    
    if (alarmName.includes('Error')) return 'Application error spike detected';
    if (alarmName.includes('Memory')) return 'Memory usage exceeded threshold';
    if (alarmName.includes('CPU')) return 'CPU utilization high';
    if (alarmName.includes('Latency')) return 'Response latency increased';
    if (alarmName.includes('Timeout')) return 'Request timeout detected';
    
    return 'System anomaly detected';
  }

  getRecommendedAction(alarmData) {
    const severity = this.determineSeverity(alarmData);
    
    if (severity === 'critical') {
      return 'Scale resources, investigate logs, prepare rollback';
    } else if (severity === 'high') {
      return 'Increase capacity, monitor metrics, check application';
    } else if (severity === 'medium') {
      return 'Review system state, optimize resources, monitor';
    }
    
    return 'Monitor situation, prepare contingency plan';
  }
}

// IMPORTANT: Export the class, not an instance
module.exports = ReasoningAgent;