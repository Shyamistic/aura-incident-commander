// service-orchestrator/src/slo/tracker.js
const db = require('../db/schema');

class SLOTracker {
  constructor() {
    this.slos = {
      uptime: { target: 99.9, period: '30d' },
      mttr: { target: 300, period: '30d' }, // 5 minutes
      mttd: { target: 60, period: '30d' },  // 1 minute
      success_rate: { target: 99.5, period: '30d' }
    };
  }
  
  calculateErrorBudget(sloType) {
    const slo = this.slos[sloType];
    const periodStart = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    const incidents = db.prepare(`
      SELECT * FROM incidents 
      WHERE timestamp > ? 
      ORDER BY timestamp DESC
    `).all(periodStart);
    
    if (sloType === 'mttr') {
      const avgMTTR = incidents.reduce((sum, i) => 
        sum + (i.execution_time || 0), 0) / incidents.length;
      
      const budgetUsed = (avgMTTR / slo.target) * 100;
      const remaining = 100 - budgetUsed;
      
      return {
        target: slo.target,
        actual: avgMTTR,
        budgetRemaining: Math.max(0, remaining),
        status: remaining > 20 ? 'healthy' : 'critical'
      };
    }
    
    // Similar calculations for other SLOs
  }
  
  getAlerts() {
    const alerts = [];
    
    Object.keys(this.slos).forEach(sloType => {
      const budget = this.calculateErrorBudget(sloType);
      
      if (budget.budgetRemaining < 20) {
        alerts.push({
          severity: 'critical',
          slo: sloType,
          message: `Error budget for ${sloType} is at ${budget.budgetRemaining.toFixed(1)}%`,
          recommendation: 'Pause feature releases and focus on stability'
        });
      }
    });
    
    return alerts;
  }
}

module.exports = new SLOTracker();
