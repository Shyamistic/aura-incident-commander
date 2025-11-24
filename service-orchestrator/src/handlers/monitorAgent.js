// service-orchestrator/src/handlers/monitorAgent.js
// MONITOR AGENT - DETECTS ALARMS & ROUTES TO REASONING - FULLY FIXED

async function handleAlarm(snsPayload, context) {
  const { pushEvent, hitlController, functionName } = context;
  
  try {
    pushEvent({ source: 'MonitorAgent', type: 'alarm.received', detail: 'SNS message received' });
    
    // Parse SNS message
    let alarmData = {};
    if (snsPayload.Message) {
      alarmData = JSON.parse(snsPayload.Message);
    } else {
      alarmData = snsPayload;
    }
    
    const alarmName = alarmData.AlarmName || 'UnknownAlarm';
    pushEvent({ source: 'MonitorAgent', type: 'alarm.parsed', detail: `Parsed alarm: ${alarmName}` });
    
    // Create incident ID
    const incidentId = `incident-${Date.now()}`;
    
    // Load and instantiate ReasoningAgent - PROPERLY
    try {
      const ReasoningAgent = require('../agents/ReasoningAgent');
      const reasoningAgent = new ReasoningAgent({ pushEvent, hitlController, functionName });
      await reasoningAgent.analyze(alarmData, incidentId);
    } catch (err) {
      console.error('[MonitorAgent] ReasoningAgent error:', err.message);
      pushEvent({ source: 'MonitorAgent', type: 'error', detail: `ReasoningAgent: ${err.message}` });
      
      // Fallback: just log the alarm if ReasoningAgent fails
      pushEvent({ 
        source: 'MonitorAgent', 
        type: 'fallback', 
        detail: `Alarm logged: ${alarmName}, manual review required` 
      });
    }
    
  } catch (err) {
    console.error('[MonitorAgent] Error:', err.message);
    pushEvent({ source: 'MonitorAgent', type: 'error', detail: err.message });
    throw err;
  }
}

module.exports = { handleAlarm };

module.exports = { handleAlarm };