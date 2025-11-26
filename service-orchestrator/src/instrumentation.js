/* FILENAME: src/instrumentation.js
  PURPOSE: OpenTelemetry Observability (The "X-Ray" Vision)
  USAGE: Require this at the very top of index.js
*/

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

// In production, swap ConsoleSpanExporter for OTLPTraceExporter (to send to Datadog/NewRelic/Jaeger)
const traceExporter = new ConsoleSpanExporter();

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'aura-incident-commander',
    [SemanticResourceAttributes.SERVICE_VERSION]: '3.0.0-enterprise',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'production',
  }),
  traceExporter,
  instrumentations: [getNodeAutoInstrumentations({
    // Reduce noise by disabling fs/net tracing for internal libs
    '@opentelemetry/instrumentation-fs': { enabled: false },
    '@opentelemetry/instrumentation-express': { enabled: true },
    '@opentelemetry/instrumentation-aws-sdk': { enabled: true }, // Crucial: Traces AWS calls
  })],
});

// Graceful startup
try {
  sdk.start();
  console.log('🔍 [System] OpenTelemetry Observability: ACTIVE');
} catch (error) {
  console.error('⚠️ [System] OpenTelemetry failed to start:', error);
}

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('🔍 [System] OpenTelemetry shut down'))
    .catch((error) => console.log('⚠️ [System] Error shutting down OpenTelemetry', error));
});

module.exports = sdk;