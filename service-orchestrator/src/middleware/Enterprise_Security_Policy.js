/* FILENAME: src/middleware/Enterprise_Security_Policy.js
  PURPOSE: RBAC, PII Redaction, and "Tools Picker" Security
*/

const { redact } = require('./piiRedactor'); // Assumes your existing redactor is here

// 1. Role-Based Access Control Matrix
const PERMISSIONS = {
  'viewer': ['read:events', 'read:reports'],
  'operator': ['read:events', 'read:reports', 'action:approve', 'action:deny'],
  'admin': ['*', 'system:reset', 'config:edit'],
  'system_agent': ['read:logs', 'write:cloudwatch', 'write:lambda'] // The AI's scope
};

// 2. Sensitive Action Governance
const BLOCKED_ACTIONS = [
  'DeleteDBInstance', 
  'TerminateInstances', // Only allow via specific chaos flow
  'DeleteBucket'
];

class EnterpriseSecurity {
  
  static enforce(requiredPerm) {
    return (req, res, next) => {
      // Stub: In real world, decode JWT from req.headers.authorization
      const userRole = req.headers['x-role'] || 'operator'; 
      const tenantId = req.headers['x-tenant-id'];

      if (!tenantId) {
        return res.status(401).json({ error: 'Security: Missing X-Tenant-ID' });
      }

      const userPerms = PERMISSIONS[userRole] || [];
      const hasPerm = userPerms.includes('*') || userPerms.includes(requiredPerm);

      if (!hasPerm) {
        console.warn(`[Security] Blocked access to ${requiredPerm} for ${userRole}`);
        return res.status(403).json({ error: 'Access Denied: Insufficient Privileges' });
      }

      // Add audit context
      req.auditContext = {
        user: req.headers['x-user-id'] || 'anonymous',
        role: userRole,
        tenant: tenantId,
        ip: req.ip
      };

      next();
    };
  }

  static validateAiAction(actionName, params) {
    // This is called internally by Agents before executing tools
    if (BLOCKED_ACTIONS.some(blocked => actionName.includes(blocked))) {
      throw new Error(`SECURITY VETO: AI attempted restricted action ${actionName}`);
    }
    // Deep inspection of params for SQL injection or command injection could go here
    return true;
  }

  static sanitizeResponse(req, res, next) {
    const originalSend = res.send;
    res.send = function(body) {
      // Hook into the response to redact PII before it leaves the server
      if (typeof body === 'string') {
        body = redact(body); 
      } else if (typeof body === 'object') {
        // deeply redact object (simplified for snippet)
        const str = JSON.stringify(body);
        body = JSON.parse(redact(str));
      }
      originalSend.call(this, body);
    };
    next();
  }
}

module.exports = EnterpriseSecurity;