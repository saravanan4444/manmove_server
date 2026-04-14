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
const Camera  = require('../models/camera');
const Worklog = require('../models/worklog');
const Expense = require('../models/expense');
const SystemLog = require('../models/systemlog');
const CameraMaintenance = require('../models/cameramaintenance');

const PAGE_H   = 841;  // A4 height in points
const PAGE_W   = 595;
const MARGIN   = 50;
const ROW_H    = 20;   // fixed row height — prevents overlap
const HEADER_H = 145;  // space used by page header

function drawHeader(doc, title, project) {
  // Company name + blue bar
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#1976D2').text('ManMove Networks', MARGIN, 40);
  doc.fontSize(10).font('Helvetica').fillColor('#666').text(title, MARGIN, 60);
  doc.moveTo(MARGIN, 75).lineTo(PAGE_W - MARGIN, 75).strokeColor('#1976D2').lineWidth(2).stroke();

  // Project info
  doc.fillColor('#000').fontSize(12).font('Helvetica-Bold').text(project.name, MARGIN, 82);
  doc.fontSize(9).font('Helvetica').fillColor('#555')
    .text(`Client: ${project.client_name || '—'}   District: ${project.district || '—'}   State: ${project.state || '—'}`, MARGIN, 98)
    .text(`Generated: ${new Date().toLocaleString('en-IN')}`, MARGIN, 112);

  // Reset cursor below header
  doc.y = HEADER_H;
}

function sectionTitle(doc, title) {
  checkPageBreak(doc, 30);
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1976D2').text(title, MARGIN, doc.y);
  doc.moveDown(0.4);
}

function checkPageBreak(doc, needed = ROW_H + 5) {
  if (doc.y + needed > PAGE_H - MARGIN) {
    doc.addPage();
    doc.y = MARGIN;
  }
}

function tableHeader(doc, cols, widths) {
  checkPageBreak(doc, ROW_H + 4);
  const y = doc.y;
  // Header background
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, ROW_H).fill('#1976D2');
  let x = MARGIN;
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#fff');
  cols.forEach((col, i) => {
    doc.text(String(col), x + 3, y + 6, { width: widths[i] - 6, ellipsis: true });
    x += widths[i];
  });
  doc.y = y + ROW_H + 1;
}

function tableRow(doc, cols, widths, shade = false) {
  // Calculate actual height needed based on longest wrapping cell
  const cellHeights = cols.map((col, i) => {
    const lines = Math.ceil(doc.heightOfString(String(col ?? '—'), { width: widths[i] - 6 }) / 11);
    return Math.max(1, lines) * 13 + 8;
  });
  const rowH = Math.max(20, ...cellHeights);

  checkPageBreak(doc, rowH + 2);
  const y = doc.y;
  if (shade) doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, rowH).fill('#f8fafc');
  doc.moveTo(MARGIN, y + rowH).lineTo(PAGE_W - MARGIN, y + rowH).strokeColor('#e8ecf0').lineWidth(0.5).stroke();
  let x = MARGIN;
  doc.font('Helvetica').fontSize(8.5).fillColor('#333');
  cols.forEach((col, i) => {
    doc.text(String(col ?? '—'), x + 3, y + 5, { width: widths[i] - 6, lineBreak: true });
    x += widths[i];
  });
  doc.y = y + rowH + 1;
}

// ── KPI grid helper ──────────────────────────────────────────────────────────
function drawKpis(doc, kpis) {
  checkPageBreak(doc, 60);
  const BOX_W = 110, BOX_H = 42, COLS = 4;
  let kx = MARGIN, ky = doc.y;
  kpis.forEach(({ label, val, color }, i) => {
    doc.rect(kx, ky, BOX_W, BOX_H).fillAndStroke('#f8fafc', '#e8ecf0');
    doc.fillColor('#90a4ae').fontSize(8).font('Helvetica').text(label, kx + 6, ky + 6, { width: BOX_W - 12 });
    doc.fillColor(color).fontSize(14).font('Helvetica-Bold').text(String(val), kx + 6, ky + 20, { width: BOX_W - 12 });
    kx += BOX_W + 4;
    if ((i + 1) % COLS === 0) { kx = MARGIN; ky += BOX_H + 6; }
  });
  doc.y = ky + BOX_H + 14;
}

function drawProgressBar(doc, pct) {
  checkPageBreak(doc, 30);
  doc.fontSize(9).font('Helvetica').fillColor('#555').text(`Overall Progress: ${pct}%`, MARGIN, doc.y);
  doc.y += 14;
  const barW = PAGE_W - MARGIN * 2;
  doc.rect(MARGIN, doc.y, barW, 10).fill('#e8ecf0');
  if (pct > 0) doc.rect(MARGIN, doc.y, Math.round(barW * pct / 100), 10).fill('#00c853');
  doc.y += 20;
}

// ── Project Summary PDF ──────────────────────────────────────────────────────
router.get('/export/project/:id/pdf', (req, res, next) => {
  if (req.query.token && !req.headers.authorization) req.headers.authorization = `Bearer ${req.query.token}`;
  next();
}, authenticate, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).lean();
    if (!project) return res.status(404).json({ message: 'Not found' });
    const report = req.query.report || 'pole-progress';
    const pid    = req.params.id;

    const doc = new PDFDocument({ margin: MARGIN, size: 'A4', autoFirstPage: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${report}-${(project.name||'report').replace(/\s+/g,'-')}.pdf"`);
    doc.pipe(res);

    // ── POLE PROGRESS ──
    if (report === 'pole-progress') {
      const [poles, bom, tickets] = await Promise.all([
        Pole.find({ project_id: pid }, 'pole_number road_name address junction police_station current_stage status anpr_count cctv_count').lean(),
        BOM.find({ project_id: pid }).lean(),
        CameraMaintenance.find({ project_id: pid, status: 'open' }).lean(),
      ]);
      drawHeader(doc, 'Pole Progress Report', project);
      const completed = poles.filter(p => p.status === 'completed').length;
      const inProgress = poles.filter(p => p.status === 'in_progress').length;
      const delayed = poles.filter(p => p.status === 'delayed').length;
      const progress = poles.length ? Math.round(completed / poles.length * 100) : 0;
      drawKpis(doc, [
        { label: 'Total Poles', val: poles.length, color: '#1976D2' },
        { label: 'Completed',   val: completed,    color: '#2e7d32' },
        { label: 'In Progress', val: inProgress,   color: '#e65100' },
        { label: 'Delayed',     val: delayed,      color: '#c62828' },
        { label: 'Progress',    val: `${progress}%`, color: '#1976D2' },
        { label: 'ANPR Cams',   val: poles.reduce((s,p)=>s+(p.anpr_count||0),0), color: '#6a1b9a' },
        { label: 'CCTV Cams',   val: poles.reduce((s,p)=>s+(p.cctv_count||0),0), color: '#1565c0' },
        { label: 'Open Tickets',val: tickets.length, color: '#c62828' },
      ]);
      drawProgressBar(doc, progress);
      sectionTitle(doc, `Pole Status (${poles.length} poles)`);
      const w = [35, 50, 175, 75, 70, 35, 35];
      tableHeader(doc, ['SL No','Station','Junction / Address','Stage','Status','ANPR','CCTV'], w);
      poles.forEach((p,i) => tableRow(doc, [p.pole_number, p.police_station||'—', p.junction||p.road_name||p.address||'—', p.current_stage||'not_started', p.status||'not_started', p.anpr_count||0, p.cctv_count||0], w, i%2===0));
      if (bom.length) {
        doc.addPage(); drawHeader(doc, 'Bill of Materials', project);
        sectionTitle(doc, `BOM (${bom.length} items)`);
        const bw = [155,50,55,55,55,75,70];
        tableHeader(doc, ['Item','Unit','Required','Procured','Deployed','Unit Cost','Total'], bw);
        let tc = 0;
        bom.forEach((b,i) => { const cost=(b.qty_procured||0)*(b.unit_cost||0); tc+=cost; tableRow(doc,[b.item_name,b.unit,b.qty_required,b.qty_procured,b.qty_deployed,`₹${b.unit_cost||0}`,`₹${cost.toLocaleString('en-IN')}`],bw,i%2===0); });
        checkPageBreak(doc,20); doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10).fillColor('#1976D2').text(`Total: ₹${tc.toLocaleString('en-IN')}`,{align:'right'});
      }
    }

    // ── CAMERA STATUS ──
    else if (report === 'camera-status') {
      const cameras = await Camera.find({ project_id: pid }, 'camera_number camera_type ip_address current_stage status police_station').lean();
      drawHeader(doc, 'Camera Status Report', project);
      const done = cameras.filter(c=>c.status==='completed').length;
      drawKpis(doc, [
        { label:'Total Cameras', val:cameras.length, color:'#1976D2' },
        { label:'Completed',     val:done,           color:'#2e7d32' },
        { label:'In Progress',   val:cameras.filter(c=>c.status==='in_progress').length, color:'#e65100' },
        { label:'Faulty',        val:cameras.filter(c=>c.status==='faulty').length,      color:'#c62828' },
        { label:'ANPR',          val:cameras.filter(c=>c.camera_type==='anpr').length,   color:'#6a1b9a' },
        { label:'CCTV',          val:cameras.filter(c=>c.camera_type==='cctv').length,   color:'#1565c0' },
        { label:'Progress',      val:`${cameras.length?Math.round(done/cameras.length*100):0}%`, color:'#1976D2' },
      ]);
      sectionTitle(doc, `Camera List (${cameras.length})`);
      const w = [120,60,110,100,80,75];
      tableHeader(doc, ['Camera #','Type','Station','IP Address','Stage','Status'], w);
      cameras.forEach((c,i) => tableRow(doc,[c.camera_number,c.camera_type,c.police_station||'—',c.ip_address||'—',c.current_stage||'—',c.status||'—'],w,i%2===0));
    }

    // ── STATION-WISE ──
    else if (report === 'station-wise') {
      const poles = await Pole.find({ project_id: pid }, 'police_station status anpr_count cctv_count').lean();
      drawHeader(doc, 'Station-wise Report', project);
      const stMap = {};
      poles.forEach(p => {
        const s = p.police_station||'Unknown';
        if (!stMap[s]) stMap[s] = { total:0, completed:0, in_progress:0, anpr:0, cctv:0 };
        stMap[s].total++; stMap[s].anpr+=(p.anpr_count||0); stMap[s].cctv+=(p.cctv_count||0);
        if (p.status==='completed') stMap[s].completed++;
        if (p.status==='in_progress') stMap[s].in_progress++;
      });
      const stations = Object.entries(stMap).map(([name,v])=>({name,...v,pct:v.total?Math.round(v.completed/v.total*100):0})).sort((a,b)=>a.name.localeCompare(b.name));
      drawKpis(doc,[{label:'Stations',val:stations.length,color:'#1976D2'},{label:'Total Poles',val:poles.length,color:'#546e7a'},{label:'Completed',val:poles.filter(p=>p.status==='completed').length,color:'#2e7d32'}]);
      sectionTitle(doc,`Station Summary (${stations.length} stations)`);
      const w=[160,50,55,55,50,50,75];
      tableHeader(doc,['Station','Total','Done','In Prog','ANPR','CCTV','Progress'],w);
      stations.forEach((s,i)=>tableRow(doc,[s.name,s.total,s.completed,s.in_progress,s.anpr,s.cctv,`${s.pct}%`],w,i%2===0));
    }

    // ── WORK LOGS ──
    else if (report === 'work-logs') {
      const logs = await Worklog.find({ project_id: pid }, 'pole_id stage user_name remarks created_at').sort({ created_at: -1 }).limit(500).lean();
      const poles = await Pole.find({ project_id: pid }, 'pole_number _id').lean();
      const poleMap = Object.fromEntries(poles.map(p=>[p._id.toString(), p.pole_number]));
      drawHeader(doc, 'Work Logs Report', project);
      drawKpis(doc,[{label:'Total Logs',val:logs.length,color:'#1976D2'},{label:'Workers',val:new Set(logs.map(l=>l.user_name)).size,color:'#2e7d32'}]);
      sectionTitle(doc,`Work Logs (${logs.length} entries)`);
      const w=[55,80,100,90,170];
      tableHeader(doc,['Pole #','Stage','Worker','Date','Remarks'],w);
      logs.forEach((l,i)=>tableRow(doc,[poleMap[l.pole_id?.toString()]||'—',l.stage||'—',l.user_name||'—',l.created_at?new Date(l.created_at).toLocaleDateString('en-IN'):'—',l.remarks||'—'],w,i%2===0));
    }

    // ── EXPENSE ──
    else if (report === 'expense') {
      const expenses = await Expense.find({ project_id: pid }).sort({ date: -1 }).lean();
      drawHeader(doc, 'Expense Report', project);
      const total = expenses.reduce((s,e)=>s+(e.amount||0),0);
      const byType = {};
      expenses.forEach(e=>{ byType[e.type]=(byType[e.type]||0)+(e.amount||0); });
      const kpis = [{ label:'Total Spend', val:`₹${total.toLocaleString('en-IN')}`, color:'#1976D2' },
        ...Object.entries(byType).map(([t,v])=>({ label:t, val:`₹${v.toLocaleString('en-IN')}`, color:'#7b1fa2' }))];
      drawKpis(doc, kpis);
      sectionTitle(doc,`Expense Details (${expenses.length} entries)`);
      const w=[80,90,80,90,155];
      tableHeader(doc,['Type','Amount','Date','Added By','Description'],w);
      expenses.forEach((e,i)=>tableRow(doc,[e.type,`₹${(e.amount||0).toLocaleString('en-IN')}`,e.date?new Date(e.date).toLocaleDateString('en-IN'):'—',e.added_by||'—',e.description||'—'],w,i%2===0));
      checkPageBreak(doc,20); doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10).fillColor('#1976D2').text(`Total: ₹${total.toLocaleString('en-IN')}`,{align:'right'});
    }

    // ── DELAY ──
    else if (report === 'delay') {
      const twoDaysAgo = new Date(Date.now()-2*24*60*60*1000);
      const poles = await Pole.find({ project_id: pid, status:{$nin:['completed','not_started','deleted']} }, 'pole_number current_stage assigned_to').lean();
      const latestLogs = await Worklog.aggregate([
        { $match:{ pole_id:{$in:poles.map(p=>p._id)} } },
        { $sort:{ created_at:-1 } },
        { $group:{ _id:'$pole_id', last_update:{$first:'$created_at'} } }
      ]);
      const logMap = Object.fromEntries(latestLogs.map(l=>[l._id.toString(),l.last_update]));
      const delays = poles.filter(p=>{ const lu=logMap[p._id.toString()]; return !lu||new Date(lu)<twoDaysAgo; })
        .map(p=>({ ...p, last_update:logMap[p._id.toString()]||null, days_stuck:logMap[p._id.toString()]?Math.floor((Date.now()-new Date(logMap[p._id.toString()]))/86400000):null }));
      drawHeader(doc,'Delay Report',project);
      drawKpis(doc,[{label:'Delayed Poles',val:delays.length,color:'#c62828'},{label:'Active Poles',val:poles.length,color:'#e65100'}]);
      if (!delays.length) { sectionTitle(doc,'No Delayed Poles'); doc.fontSize(11).fillColor('#2e7d32').text('All active poles are being updated regularly.',MARGIN,doc.y); }
      else {
        sectionTitle(doc,`Delayed Poles (${delays.length})`);
        const w=[50,100,120,100,100];
        tableHeader(doc,['Pole #','Stage','Assigned To','Last Update','Days Stuck'],w);
        delays.forEach((d,i)=>tableRow(doc,[d.pole_number,d.current_stage,d.assigned_to||'—',d.last_update?new Date(d.last_update).toLocaleDateString('en-IN'):'Never',d.days_stuck!==null?`${d.days_stuck}d`:'N/A'],w,i%2===0));
      }
    }

    // ── ACTIVITY LOG ──
    else if (report === 'activity-log') {
      const logs = await SystemLog.find({ project_id: pid }).sort({ created_at:-1 }).limit(300).lean();
      drawHeader(doc,'Activity Log Report',project);
      drawKpis(doc,[{label:'Total Actions',val:logs.length,color:'#1976D2'},{label:'Success',val:logs.filter(l=>l.status==='success').length,color:'#2e7d32'},{label:'Errors',val:logs.filter(l=>l.status==='error').length,color:'#c62828'}]);
      sectionTitle(doc,`Activity Log (${logs.length} entries)`);
      const w=[110,80,90,100,115];
      tableHeader(doc,['Action','Entity','User','Date','Status'],w);
      logs.forEach((l,i)=>tableRow(doc,[l.action||'—',l.entity||'—',l.user_name||'—',l.created_at?new Date(l.created_at).toLocaleDateString('en-IN'):'—',l.status||'—'],w,i%2===0));
    }

    doc.end();
  } catch (err) {
    console.error('PDF export error:', err);
    if (!res.headersSent) res.status(500).json({ message: err.message });
  }
});

module.exports = router;
