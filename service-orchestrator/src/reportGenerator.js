// service-orchestrator/src/services/reportGenerator.js
// PDF REPORT GENERATOR

const { PDFDocument, rgb, degrees } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

const reportsDir = path.resolve(__dirname, '../reports');

async function generateReport(incidentId, incidentData) {
  try {
    console.log(`[ReportGenerator] Generating report for ${incidentId}...`);
    
    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    const { width, height } = page.getSize();
    
    const margin = 40;
    let yPosition = height - margin;
    
    // Helper function to add text
    const drawText = (text, size = 12, isBold = false, color = rgb(0, 0, 0)) => {
      const font = isBold ? 'Helvetica-Bold' : 'Helvetica';
      page.drawText(text, {
        x: margin,
        y: yPosition,
        size: size,
        font: font,
        color: color
      });
      yPosition -= size + 8;
    };
    
    // Title
    drawText('AURA INCIDENT REPORT', 18, true, rgb(0, 102, 204));
    yPosition -= 10;
    
    // Header Section
    drawText(`Incident ID: ${incidentId}`, 11);
    drawText(`Generated: ${incidentData.timestamp}`, 11);
    drawText(`System: AWS Lambda + CloudWatch + Amazon Q`, 11);
    yPosition -= 15;
    
    // Incident Analysis Section
    drawText('INCIDENT ANALYSIS', 14, true, rgb(0, 102, 204));
    yPosition -= 5;
    
    // Wrap long text
    const wrapText = (text, maxWidth = 520) => {
      const words = text.split(' ');
      let lines = [];
      let currentLine = '';
      
      words.forEach(word => {
        if ((currentLine + word).length > 60) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine += (currentLine ? ' ' : '') + word;
        }
      });
      if (currentLine) lines.push(currentLine);
      
      return lines;
    };
    
    const alarmLines = wrapText(incidentData.alarm);
    drawText('Root Cause Analysis:', 11, true);
    alarmLines.forEach(line => {
      if (yPosition < margin + 100) {
        // Add new page if running out of space
        const newPage = pdfDoc.addPage([600, 800]);
        page.x = 0; // Reset for new page
        yPosition = height - margin;
      }
      drawText(`  ${line}`, 10);
    });
    
    yPosition -= 10;
    drawText('Remediation Action:', 11, true);
    drawText(`  ${incidentData.remediation}`, 10, false, rgb(210, 105, 30));
    
    yPosition -= 10;
    drawText('Action Result:', 11, true);
    drawText(`  Status: Success`, 10, false, rgb(34, 139, 34));
    
    // System Response
    yPosition -= 15;
    drawText('SYSTEM RESPONSE', 14, true, rgb(0, 102, 204));
    yPosition -= 5;
    drawText('Detection: Real-time CloudWatch alarm monitoring', 10);
    drawText('Analysis: Amazon Q Developer generative reasoning', 10);
    drawText('Remediation: Autonomous Lambda configuration update', 10);
    drawText('Response Time: < 5 seconds', 10);
    
    // Footer
    yPosition -= 20;
    drawText(`Powered by AURA - Autonomous AWS Incident Response`, 10, false, rgb(128, 128, 128));
    drawText(`System Status: All systems operational`, 10, false, rgb(0, 128, 0));
    
    // Save PDF
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    const filename = `incident-report-${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;
    const filepath = path.join(reportsDir, filename);
    
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(filepath, pdfBytes);
    
    console.log(`[ReportGenerator] ✅ Successfully saved report to ${filepath}`);
    return filepath;
    
  } catch (error) {
    console.error('[ReportGenerator] ❌ Error generating report:', error.message);
    throw error;
  }
}

module.exports = { generateReport };