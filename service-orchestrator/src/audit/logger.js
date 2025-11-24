// service-orchestrator/src/audit/logger.js
const crypto = require('crypto');

class AuditLogger {
  constructor() {
    this.chain = [];
    this.loadChain();
  }
  
  log(event) {
    const previousHash = this.chain.length > 0 
      ? this.chain[this.chain.length - 1].hash 
      : '0';
    
    const entry = {
      timestamp: Date.now(),
      event: event.type,
      actor: event.actor,
      resource: event.resource,
      action: event.action,
      result: event.result,
      previousHash
    };
    
    entry.hash = this.calculateHash(entry);
    
    this.chain.push(entry);
    this.persist(entry);
    
    return entry.hash;
  }
  
  calculateHash(entry) {
    const data = JSON.stringify({
      timestamp: entry.timestamp,
      event: entry.event,
      actor: entry.actor,
      resource: entry.resource,
      action: entry.action,
      result: entry.result,
      previousHash: entry.previousHash
    });
    
    return crypto.createHash('sha256').update(data).digest('hex');
  }
  
  verify() {
    // Verify chain integrity
    for (let i = 1; i < this.chain.length; i++) {
      const current = this.chain[i];
      const previous = this.chain[i - 1];
      
      if (current.previousHash !== previous.hash) {
        return { valid: false, tamperedAt: i };
      }
      
      const recalculatedHash = this.calculateHash(current);
      if (recalculatedHash !== current.hash) {
        return { valid: false, tamperedAt: i };
      }
    }
    
    return { valid: true };
  }
}
