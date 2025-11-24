async function analyzeIncident(alarmData, mode = 'autonomous') {
  const aiResponse = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [/* existing prompt */],
    response_format: { type: "json_object" }
  });
  
  const decision = JSON.parse(aiResponse.choices[0].message.content);
  
  if (mode === 'copilot') {
    // Store pending action in memory/DB
    pendingActions.set(alarmData.incidentId, {
      decision,
      timestamp: Date.now(),
      status: 'awaiting_approval',
      alarmData
    });
    
    // Return decision without executing
    return {
      ...decision,
      requiresApproval: true,
      incidentId: alarmData.incidentId
    };
  }
  
  // Autonomous mode: execute immediately
  return decision;
}

// New endpoint: /approve
app.post('/approve/:incidentId', async (req, res) => {
  const { incidentId } = req.params;
  const { action } = req.body; // 'approve', 'reject', 'modify'
  
  const pendingAction = pendingActions.get(incidentId);
  
  if (action === 'approve') {
    // Execute the remediation
    await healAgent.execute(pendingAction.decision);
    
    // Log human approval
    auditLog.push({
      incidentId,
      action: 'human_approved',
      approver: req.user?.email || 'anonymous',
      timestamp: Date.now()
    });
  }
  
  pendingActions.delete(incidentId);
  res.json({ status: 'processed' });
});
