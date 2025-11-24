// service-orchestrator/src/services/analyticsEngine.js
// ADVANCED ANALYTICS ENGINE - REAL-TIME INCIDENT ANALYSIS

class AnalyticsEngine {
  constructor() {
    this.incidents = [];
    this.metrics = {
      totalIncidents: 0,
      resolvedIncidents: 0,
      averageResolutionTime: 0,
      mttr: 0,
      successRate: 100
    };
    this.activeAlerts = [];
    this.incidents_history = [];
  }

  recordIncident(incident) {
    const incidentRecord = {
      id: `incident-${Date.now()}`,
      timestamp: new Date().toISOString(),
      ...incident,
      status: 'active'
    };
    
    this.incidents.push(incidentRecord);
    this.metrics.totalIncidents++;
    
    return incidentRecord.id;
  }

  resolveIncident(incidentId, resolution) {
    const incident = this.incidents.find(i => i.id === incidentId);
    if (incident) {
      incident.status = 'resolved';
      incident.resolvedAt = new Date().toISOString();
      incident.resolutionTime = new Date(incident.resolvedAt) - new Date(incident.timestamp);
      incident.resolution = resolution;
      
      this.metrics.resolvedIncidents++;
      this.updateMTTR();
      this.incidents_history.push(incident);
      this.incidents = this.incidents.filter(i => i.id !== incidentId);
    }
  }

  updateMTTR() {
    const totalResolutionTime = this.incidents_history.reduce((sum, i) => sum + (i.resolutionTime || 0), 0);
    this.metrics.averageResolutionTime = this.metrics.resolvedIncidents > 0 
      ? totalResolutionTime / this.metrics.resolvedIncidents 
      : 0;
    this.metrics.mttr = this.metrics.averageResolutionTime;
  }

  getMetrics() {
    const healthScore = Math.min(100, (this.metrics.successRate * this.metrics.resolvedIncidents) / (this.metrics.totalIncidents || 1));
    return {
      ...this.metrics,
      healthScore: Math.round(healthScore),
      activeIncidents: this.incidents.length
    };
  }

  getIncidentMetrics() {
    return {
      active: this.incidents.length,
      resolved: this.metrics.resolvedIncidents,
      total: this.metrics.totalIncidents,
      successRate: this.metrics.successRate,
      recentIncidents: this.incidents_history.slice(-10)
    };
  }

  getPerformanceMetrics() {
    return {
      mttr: this.metrics.mttr,
      averageResolutionTime: this.metrics.averageResolutionTime,
      incidentTrend: this.calculateTrend(),
      systemReliability: this.calculateReliability()
    };
  }

  calculateTrend() {
    const recent = this.incidents_history.slice(-24);
    return recent.length > 0 
      ? (recent.length / (recent.length + this.incidents.length)) * 100 
      : 0;
  }

  calculateReliability() {
    return this.metrics.totalIncidents > 0
      ? (this.metrics.resolvedIncidents / this.metrics.totalIncidents) * 100
      : 100;
  }

  addAlert(alert) {
    this.activeAlerts.push({
      id: `alert-${Date.now()}`,
      timestamp: new Date().toISOString(),
      ...alert
    });
  }

  getActiveAlerts() {
    return this.activeAlerts;
  }

  clearResolvedAlerts() {
    this.activeAlerts = this.activeAlerts.filter(a => a.status !== 'resolved');
  }
}

module.exports = AnalyticsEngine;