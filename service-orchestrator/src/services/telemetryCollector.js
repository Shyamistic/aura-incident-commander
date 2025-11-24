// service-orchestrator/src/services/telemetryCollector.js
// ENTERPRISE TELEMETRY COLLECTOR

class TelemetryCollector {
  constructor() {
    this.telemetry = [];
    this.traces = [];
    this.metrics = {};
  }

  recordEvent(event) {
    this.telemetry.push({
      timestamp: new Date().toISOString(),
      ...event
    });

    // Keep last 10000 events
    if (this.telemetry.length > 10000) {
      this.telemetry.shift();
    }
  }

  recordTrace(traceId, span) {
    if (!this.traces[traceId]) {
      this.traces[traceId] = [];
    }
    this.traces[traceId].push({
      timestamp: new Date().toISOString(),
      ...span
    });
  }

  recordMetric(name, value, tags = {}) {
    if (!this.metrics[name]) {
      this.metrics[name] = [];
    }
    this.metrics[name].push({
      timestamp: new Date().toISOString(),
      value,
      tags
    });
  }

  getTelemetry(filter = {}) {
    let result = this.telemetry;
    
    if (filter.source) {
      result = result.filter(t => t.source === filter.source);
    }
    if (filter.type) {
      result = result.filter(t => t.type === filter.type);
    }
    
    return result.slice(-1000);
  }

  getTraces(traceId) {
    return this.traces[traceId] || [];
  }

  getMetricsSummary() {
    const summary = {};
    for (const [name, values] of Object.entries(this.metrics)) {
      if (values.length === 0) continue;
      
      const nums = values.map(v => v.value);
      summary[name] = {
        count: nums.length,
        sum: nums.reduce((a, b) => a + b, 0),
        avg: nums.reduce((a, b) => a + b, 0) / nums.length,
        min: Math.min(...nums),
        max: Math.max(...nums),
        latest: nums[nums.length - 1]
      };
    }
    return summary;
  }
}

module.exports = TelemetryCollector;