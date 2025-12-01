⚡ AURA: Autonomous SRE Platform"Reliability without humans. Safety without compromise."AURA is an enterprise-grade Autonomous Incident Response System designed to Detect, Diagnose, and Heal AWS infrastructure failures in seconds. Unlike traditional chatbots, AURA uses Shadow Mode to verify fixes in a sandbox before touching production, solving the "AI Trust Gap."🧠 The ArchitectureAURA is built on an Event-Driven, Multi-Agent architecture powered by Amazon Bedrock (Claude 3.5 Sonnet) and Amazon Q Developer.Code snippetgraph TD
    User((👨‍💻 SRE User)) -->|Voice Command| UI[🖥️ AURA Dashboard]
    UI -->|HTTPS/REST| API[⚙️ Orchestrator API]
    
    subgraph "The Brain (Render/AWS)"
        API -->|1. Detect| Monitor[👁️ Monitor Agent]
        Monitor -->|2. Diagnose| Reason[🧠 Reasoning Agent]
        
        Reason <-->|RAG Lookup| KB[(📚 Knowledge Base)]
        Reason -->|3. Plan| Bedrock[🤖 Amazon Bedrock]
        
        Bedrock -->|4. Verify| Supervisor[🛡️ Supervisor Agent]
        Supervisor -->|5. Validate| Shadow[🧪 Shadow Mode Env]
        
        Shadow -- Success --> Heal[⚕️ Heal Agent]
        Shadow -- Fail --> Rollback[↩️ Rollback]
        
        Heal -->|6. Execute| AWS[☁️ AWS Production]
    end
    
    subgraph "Safety & Governance"
        PII[🔒 PII Redactor]
        FinOps[💰 FinOps Engine]
    end
    
    API --> PII
    Reason --> FinOps
🚀 Key Innovation: Shadow ModeMost AI agents are dangerous because they apply fixes directly to production. AURA introduces Shadow Mode:Simulation: The AI executes the remediation in a temporary, isolated sandbox.Verification: A "Supervisor Agent" checks metrics (Latency, Error Rate).Promotion: Only if the fix works in Shadow Mode does it apply to Production.✨ Features🛡️ Enterprise SecurityPII Redaction Engine: Automatically scrubs IP addresses, Emails, and API Keys from logs before they reach the LLM.RAG Compliance: The AI cites specific Corporate SOPs (e.g., "Policy SOP-001") to justify every decision.💰 FinOps IntelligenceCost-Aware Remediation: AURA calculates the financial impact of a fix before execution.Budget Guardrails: Prevents auto-scaling if the projected cost exceeds $50/day.🎙️ Jarvis Voice ControlNatural Language Ops: "Deploy production stack" or "Simulate memory leak."No-Code Interface: Operators command infrastructure without writing scripts.🔥 Chaos EngineeringBuilt-in Chaos Monkey: Intentionally injects faults (Latency Spikes, OOM, DB Crashes) to prove resilience.Self-Healing: Watch the system detect and fix the chaos in <10 seconds.🛠️ Tech StackComponentTechnologyDescriptionFrontendHTML5 / CSS3 / JSDeployed on Netlify (Global Edge)BackendNode.js / ExpressDeployed on Render (Cloud Service)AI BrainAmazon BedrockPowered by Claude 3.5 SonnetCode GenAmazon Q DeveloperUsed for generating Lambda & CDK logicMonitoringAWS CloudWatchReal-time metric ingestionEventsAWS SNSEvent-driven architecture⚡ Quick StartPrerequisitesNode.js v18+AWS Credentials (with AdministratorAccess or scoped permissions)Amazon Q / Bedrock Access EnabledInstallationClone the RepoBashgit clone https://github.com/Shyamistic/aura-incident-commander.git
cd aura-incident-commander
Install DependenciesBashcd service-orchestrator
npm install
Configure EnvironmentCreate a .env file in service-orchestrator:BashAMAZON_Q_AGENT_ID=your_id
AMAZON_Q_AGENT_ALIAS_ID=your_alias
AWS_REGION=us-east-1
HITL_MODE=autonomous
Run LocallyBackend: node service-orchestrator/src/index.jsFrontend: Open frontend/index.html via Live Server.
🎬 How to DemoOpen the Dashboard: Navigate to your deployed Netlify link.Voice Command: Click the Mic and say "Deploy production stack."Inject Chaos: Click "🐢 Latency" in the Chaos Menu.Watch the Magic:The "Monitor" node turns Red.The AI Panel appears with a Plan, Cost Estimate, and Policy Citation.The System verifies the fix in Shadow Mode.The nodes turn Green as the incident resolves.🏆 Why AURA?AURA isn't just a monitoring tool; it's an Autonomous SRE Teammate. It moves cloud operations from "Alerting" to "Solving," bridging the gap between AI potential and Enterprise trust.Built with ❤️ for the Amazon Q Hackathon.
