// service-orchestrator/src/metrics/collector.js
const { CloudWatchClient, GetMetricStatisticsCommand } = 
  require('@aws-sdk/client-cloudwatch');

class MetricsCollector {
  constructor() {
    this.client = new CloudWatchClient({ region: 'us-east-1' });
  }
  
  async collectLambdaMetrics(functionName) {
    const metrics = ['Invocations', 'Errors', 'Duration', 'Throttles'];
    const endTime = new Date();
    const startTime = new Date(endTime - 3600000); // Last hour
    
    const results = await Promise.all(
      metrics.map(async (metric) => {
        const command = new GetMetricStatisticsCommand({
          Namespace: 'AWS/Lambda',
          MetricName: metric,
          Dimensions: [
            { Name: 'FunctionName', Value: functionName }
          ],
          StartTime: startTime,
          EndTime: endTime,
          Period: 300, // 5 minute intervals
          Statistics: ['Average', 'Sum', 'Maximum']
        });
        
        const response = await this.client.send(command);
        return { metric, data: response.Datapoints };
      })
    );
    
    return this.calculateHealthScore(results);
  }
  
  calculateHealthScore(metrics) {
    // Weighted scoring: Errors (40%), Duration (30%), Throttles (30%)
    const errors = metrics.find(m => m.metric === 'Errors').data;
    const duration = metrics.find(m => m.metric === 'Duration').data;
    const throttles = metrics.find(m => m.metric === 'Throttles').data;
    
    const errorRate = errors.reduce((sum, d) => sum + d.Sum, 0);
    const avgDuration = duration.reduce((sum, d) => sum + d.Average, 0) / duration.length;
    const throttleRate = throttles.reduce((sum, d) => sum + d.Sum, 0);
    
    const healthScore = 100 - (
      (errorRate * 0.4) +
      ((avgDuration / 10000) * 0.3) + // Normalize to 10s max
      (throttleRate * 0.3)
    );
    
    return {
      score: Math.max(0, Math.min(100, healthScore)),
      status: healthScore > 90 ? 'healthy' : healthScore > 70 ? 'degraded' : 'critical',
      metrics: { errorRate, avgDuration, throttleRate }
    };
  }
}
