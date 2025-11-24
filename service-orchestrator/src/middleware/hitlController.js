// service-orchestrator/src/middleware/hitlController.js
// HUMAN-IN-THE-LOOP CONTROLLER

class HITLController {
  constructor() {
    this.pendingApprovals = new Map();
    this.mode = process.env.HITL_MODE || 'autonomous'; // 'autonomous' or 'copilot'
    console.log(`[HITL] Controller initialized in '${this.mode}' mode.`);
  }

  async requestApproval(incidentId, remediationPlan) {
    console.log(`[HITL] Requesting approval for ${incidentId}: ${remediationPlan}`);
    
    if (this.mode === 'autonomous') {
      // Auto-approve
      return { approved: true, auto: true };
    }

    // Store pending approval
    this.pendingApprovals.set(incidentId, {
      plan: remediationPlan,
      timestamp: Date.now(),
      status: 'pending'
    });

    // Wait for human approval (with 5-minute timeout)
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const approval = this.pendingApprovals.get(incidentId);
        
        if (!approval) return; // Already cleared
        
        if (approval.status === 'approved') {
          clearInterval(checkInterval);
          resolve({ approved: true, auto: false });
        } else if (approval.status === 'denied') {
          clearInterval(checkInterval);
          resolve({ approved: false, auto: false });
        } else if (Date.now() - approval.timestamp > 300000) {
          // 5-minute timeout - auto-approve
          clearInterval(checkInterval);
          resolve({ approved: false, timeout: true });
        }
      }, 1000);
    });
  }

  approve(incidentId) {
    const approval = this.pendingApprovals.get(incidentId);
    if (approval) {
      approval.status = 'approved';
      console.log(`[HITL] ✅ Approved: ${incidentId}`);
    }
  }

  deny(incidentId) {
    const approval = this.pendingApprovals.get(incidentId);
    if (approval) {
      approval.status = 'denied';
      console.log(`[HITL] ❌ Denied: ${incidentId}`);
    }
  }
}

module.exports = HITLController;
