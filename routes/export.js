/**
 * PDF export route — project summary, BOM, pole status report
 */
const express = require('express');
const router  = express.Router();
const PDFDocument = require('pdfkit');
const { authenticate } = require('../config/authMiddleware');
const Project = require('../models/project');
const Pole    = require('../models/pole');
const BOM     = require('../models/bom');
const CameraMaintenance = require('../models/cameramaintenance');

function header(doc, title, project) {
  doc.fontSize(18).font('Helvetica-Bold').text('ManMove Networks', 50, 40);
  doc.fontSize(11).font('Helvetica').fillColor('#666').text(title, 50, 65);
  doc.moveTo(50, 82).lineTo(545, 82).strokeColor('#1976D2').lineWidth(2).stroke();
  doc.fillColor('#000').fontSize(13).font('Helvetica-Bold').text(project.name, 50, 92);
  doc.fontSize(10).font('Helvetica').fillColor('#555')
    .text(`Client: ${project.client_name || '—'}   |   District: ${project.district || '—'}   |   State: ${project.state || '—'}`, 50, 110)
    .text(`Generated: ${new Date().toLocaleString('en-IN')}`, 50, 124);
  doc.moveDown(2);
}

function tableRow(doc, cols, y, widths, isHeader = false) {
  let x = 50;
  doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(isHeader ? '#1976D2' : '#333');
  cols.forEach((col, i) => { doc.text(String(col ?? '—'), x + 2, y + 3, { width: widths[i] - 4, ellipsis: true }); x += widths[i]; });
  doc.moveTo(50, y + 16).lineTo(545, y + 16).strokeColor('#e0e0e0').lineWidth(0.5).stroke();
}

// ── Project Summary PDF ──────────────────────────────────────────────────────
router.get('/export/project/:id/pdf', (req, res, next) => {
  // Allow token via query param for direct browser download links
  if (req.query.token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
}, authenticate, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).lean();
    if (!project) return res.status(404).json({ message: 'Not found' });

    const [poles, bom, tickets] = await Promise.all([
      Pole.find({ project_id: req.params.id }).lean(),
      BOM.find({ project_id: req.params.id }).lean(),
      CameraMaintenance.find({ project_id: req.params.id }).lean(),
    ]);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="manmove-${project.name.replace(/\s+/g,'-')}.pdf"`);
    doc.pipe(res);

    header(doc, 'Project Summary Report', project);

    // KPI summary
    const completed  = poles.filter(p => p.status === 'completed').length;
    const inProgress = poles.filter(p => p.status === 'in_progress').length;
    const delayed    = poles.filter(p => p.status === 'delayed').length;
    const progress   = poles.length ? Math.round(completed / poles.length * 100) : 0;

    doc.fontSize(11).font('Helvetica-Bold').fillColor('#333').text('Project KPIs', 50, doc.y);
    doc.moveDown(0.3);
    const kpis = [
      ['Total Poles', poles.length], ['Completed', completed],
      ['In Progress', inProgress],   ['Delayed', delayed],
      ['Progress', `${progress}%`],  ['Budget', `₹${(project.budget||0).toLocaleString('en-IN')}`],
      ['Billed', `₹${(project.billed_amount||0).toLocaleString('en-IN')}`],
      ['Open Tickets', tickets.filter(t => t.status === 'open').length],
    ];
    let kx = 50, ky = doc.y;
    kpis.forEach(([label, val], i) => {
      doc.rect(kx, ky, 115, 36).fillAndStroke('#f5f5f5', '#e0e0e0');
      doc.fillColor('#888').fontSize(8).font('Helvetica').text(label, kx + 6, ky + 6);
      doc.fillColor('#1976D2').fontSize(13).font('Helvetica-Bold').text(String(val), kx + 6, ky + 17);
      kx += 124;
      if ((i + 1) % 4 === 0) { kx = 50; ky += 44; }
    });
    doc.y = ky + 50;

    // Poles table
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#333').text('Pole Status', 50, doc.y);
    doc.moveDown(0.3);
    const poleWidths = [50, 160, 100, 80, 80, 75];
    tableRow(doc, ['SL No', 'Address / Road', 'Stage', 'Status', 'Power', 'Earthing'], doc.y, poleWidths, true);
    poles.slice(0, 40).forEach(p => {
      if (doc.y > 720) { doc.addPage(); }
      tableRow(doc, [p.pole_number, p.road_name || p.address, p.current_stage, p.status, p.power_source, p.earthing_done ? 'Done' : 'Pending'], doc.y + 2, poleWidths);
    });

    // BOM table
    if (bom.length) {
      doc.addPage();
      header(doc, 'Bill of Materials', project);
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#333').text('Procurement Summary', 50, doc.y);
      doc.moveDown(0.3);
      const bomWidths = [160, 60, 60, 60, 60, 80, 65];
      tableRow(doc, ['Item', 'Unit', 'Required', 'Procured', 'Deployed', 'Unit Cost', 'Total'], doc.y, bomWidths, true);
      let totalCost = 0;
      bom.forEach(b => {
        if (doc.y > 720) { doc.addPage(); }
        const cost = (b.qty_procured || 0) * (b.unit_cost || 0);
        totalCost += cost;
        tableRow(doc, [b.item_name, b.unit, b.qty_required, b.qty_procured, b.qty_deployed, `₹${b.unit_cost}`, `₹${cost.toLocaleString('en-IN')}`], doc.y + 2, bomWidths);
      });
      doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10).fillColor('#1976D2')
        .text(`Total Material Cost: ₹${totalCost.toLocaleString('en-IN')}`, { align: 'right' });
    }

    doc.end();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
