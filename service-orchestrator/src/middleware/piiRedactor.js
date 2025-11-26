// service-orchestrator/src/middleware/piiRedactor.js
// ENTERPRISE SECURITY: Redacts PII before logging or AI processing

const PII_PATTERNS = {
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  IP_ADDRESS: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
  AWS_KEY: /(AKIA|ASIA)[0-9A-Z]{16}/g
};

function redact(text) {
  if (!text || typeof text !== 'string') return text;
  
  let cleanText = text;
  cleanText = cleanText.replace(PII_PATTERNS.EMAIL, '[REDACTED_EMAIL]');
  cleanText = cleanText.replace(PII_PATTERNS.IP_ADDRESS, '[REDACTED_IP]');
  cleanText = cleanText.replace(PII_PATTERNS.AWS_KEY, '[REDACTED_AWS_KEY]');
  
  return cleanText;
}

module.exports = { redact };