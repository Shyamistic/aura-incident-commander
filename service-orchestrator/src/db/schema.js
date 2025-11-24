const Database = require('better-sqlite3');
const db = new Database('aura.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    timestamp INTEGER,
    alarm_name TEXT,
    function_name TEXT,
    root_cause TEXT,
    remediation_plan TEXT,
    command TEXT,
    status TEXT,
    mode TEXT,
    approver TEXT,
    execution_time INTEGER
  );
  
  CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER,
    metric_name TEXT,
    value REAL,
    incident_id TEXT,
    FOREIGN KEY(incident_id) REFERENCES incidents(id)
  );
  
  CREATE TABLE IF NOT EXISTS agent_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    incident_id TEXT,
    agent_name TEXT,
    decision_data TEXT,
    confidence REAL,
    timestamp INTEGER,
    FOREIGN KEY(incident_id) REFERENCES incidents(id)
  );
`);

module.exports = db;
