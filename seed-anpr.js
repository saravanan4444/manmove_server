require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URL || 'mongodb://127.0.0.1/manmove').then(async () => {
  const Project = require('./models/project');
  const Pole    = require('./models/pole');
  const Worklog = require('./models/worklog');
  const Zone    = require('./models/zones');
  const Expense = require('./models/expense');
  const Camera  = require('./models/camera');

  const BUGS = [];
  const bug = (l, d) => { BUGS.push(l + ': ' + d); console.error('  ❌ [' + l + ']:', d); };
  const ok  = (msg)  => console.log('  ✅', msg);

  const proj = await Project.findOne({ company: 'SecureVision CCTV' });
  ok('Project: ' + proj.name + ' id=' + proj._id);

  const zone = await Zone.findOne({ company: 'SecureVision CCTV' });
  ok('Zone: ' + (zone ? zone.name : 'none'));

  // ── Poles ──────────────────────────────────────────────────────────────
  console.log('\n━━━ Seeding ANPR Poles ━━━');
  await Pole.deleteMany({ project_id: proj._id });

  const poleData = [
    { pole_number:'P-CBE-001', status:'completed',   current_stage:'completed',       location:'Gandhipuram Signal',  latitude:11.0168, longitude:76.9558, police_station:'Gandhipuram PS', junction:'Gandhipuram Main Junction', cctv_count:2, anpr_count:2, assigned_to:'FU001', assigned_name:'Arjun Selvam' },
    { pole_number:'P-CBE-002', status:'completed',   current_stage:'completed',       location:'RS Puram Signal',     latitude:11.0050, longitude:76.9612, police_station:'RS Puram PS',    junction:'RS Puram Circle',           cctv_count:2, anpr_count:2, assigned_to:'FU001', assigned_name:'Arjun Selvam' },
    { pole_number:'P-CBE-003', status:'in_progress', current_stage:'camera_installed',location:'Peelamedu Junction',  latitude:11.0300, longitude:77.0200, police_station:'Peelamedu PS',   junction:'Peelamedu Flyover',         cctv_count:2, anpr_count:1, assigned_to:'FU002', assigned_name:'Divya Nair' },
    { pole_number:'P-CBE-004', status:'in_progress', current_stage:'pole_installed',  location:'Saibaba Colony',      latitude:11.0220, longitude:76.9700, police_station:'Saibaba PS',     junction:'Saibaba Colony Signal',     cctv_count:1, anpr_count:1, assigned_to:'FU002', assigned_name:'Divya Nair' },
    { pole_number:'P-CBE-005', status:'not_started', current_stage:'not_started',     location:'Singanallur',         latitude:11.0000, longitude:77.0100, police_station:'Singanallur PS', junction:'Singanallur Junction',      cctv_count:2, anpr_count:2, assigned_to:'FU003', assigned_name:'Kiran Babu' },
    { pole_number:'P-CBE-006', status:'not_started', current_stage:'not_started',     location:'Ukkadam',             latitude:10.9900, longitude:76.9800, police_station:'Ukkadam PS',     junction:'Ukkadam Bus Stand',         cctv_count:2, anpr_count:1, assigned_to:'FU003', assigned_name:'Kiran Babu' },
    { pole_number:'P-CBE-007', status:'delayed',     current_stage:'foundation',      location:'Tidel Park',          latitude:11.0100, longitude:77.0300, police_station:'Tidel PS',       junction:'Tidel Park Signal',         cctv_count:2, anpr_count:2, assigned_to:'FU004', assigned_name:'Meena Raj' },
    { pole_number:'P-CBE-008', status:'delayed',     current_stage:'digging',         location:'Avinashi Road',       latitude:11.0400, longitude:77.0000, police_station:'Avinashi PS',    junction:'Avinashi Road Junction',    cctv_count:1, anpr_count:1, assigned_to:'FU004', assigned_name:'Meena Raj' },
  ];

  const poles = [];
  for (const p of poleData) {
    const pole = await Pole.create({ ...p, project_id: proj._id, zone_id: zone ? zone._id : null, company: 'SecureVision CCTV' });
    poles.push(pole);
    ok('Pole: ' + p.pole_number + ' (' + p.status + ')');
  }

  // ── Worklogs ───────────────────────────────────────────────────────────
  console.log('\n━━━ Seeding Worklogs ━━━');
  await Worklog.deleteMany({ project_id: proj._id });

  const stageMap = {
    completed:   ['digging','foundation','pole_installed','cabling_done','camera_installed','testing','completed'],
    in_progress: ['digging','foundation','pole_installed'],
    not_started: [],
    delayed:     ['digging'],
  };

  for (const pole of poles) {
    const stages = stageMap[pole.status] || [];
    for (const stage of stages) {
      await Worklog.create({
        project_id: proj._id, pole_id: pole._id,
        stage, company: 'SecureVision CCTV',
        user_id: pole.assigned_to, user_name: pole.assigned_name,
        remarks: stage + ' done for ' + pole.pole_number,
        latitude: pole.latitude, longitude: pole.longitude,
        created_at: new Date(Date.now() - Math.random() * 7 * 86400000)
      });
    }
    if (stages.length) ok('Worklogs for ' + pole.pole_number + ': ' + stages.length + ' stages');
  }

  // ── Expenses ───────────────────────────────────────────────────────────
  console.log('\n━━━ Seeding Expenses ━━━');
  await Expense.deleteMany({ project_id: proj._id });
  for (const exp of [
    { title:'Civil Work - P-CBE-001', amount:28000, category:'civil',  empId:'FU001', empName:'Arjun Selvam', date:'2026-03-10' },
    { title:'Civil Work - P-CBE-002', amount:28000, category:'civil',  empId:'FU001', empName:'Arjun Selvam', date:'2026-03-12' },
    { title:'Material Transport',     amount:5000,  category:'travel', empId:'FU002', empName:'Divya Nair',   date:'2026-03-15' },
    { title:'Labour - Pole Install',  amount:12000, category:'labour', empId:'FU002', empName:'Divya Nair',   date:'2026-03-18' },
    { title:'Fuel - Site Visits',     amount:3500,  category:'travel', empId:'FU003', empName:'Kiran Babu',   date:'2026-03-20' },
  ]) {
    await Expense.create({ ...exp, project_id: proj._id, company: 'SecureVision CCTV', division: 'anpr' });
    ok('Expense: ' + exp.title + ' Rs.' + exp.amount);
  }

  // ── ANPR Cameras ───────────────────────────────────────────────────────
  console.log('\n━━━ Seeding ANPR Cameras ━━━');
  await Camera.deleteMany({ division: 'anpr', company: 'SecureVision CCTV' });
  for (let i = 0; i < 4; i++) {
    const pole = poles[i];
    for (const dir of ['Inbound', 'Outbound']) {
      await Camera.create({
        camera_number: 'ANPR-CBE-' + String(i * 2 + (dir === 'Inbound' ? 1 : 2)).padStart(3, '0'),
        brand: 'Hikvision', model: 'iDS-2CD7A26G0', type: 'anpr', resolution: '2MP',
        ip_address: '192.168.' + (30 + i) + '.' + (dir === 'Inbound' ? 1 : 2),
        company: 'SecureVision CCTV', division: 'anpr',
        status: pole.status === 'completed' ? 'active' : 'inactive',
        location: pole.location + ' - ' + dir,
        pole_id: pole._id, project_id: proj._id
      });
    }
    ok('ANPR Cameras for ' + pole.pole_number);
  }

  // ── Dashboard Verification ─────────────────────────────────────────────
  console.log('\n━━━ ANPR Dashboard Verification ━━━');
  const total       = await Pole.countDocuments({ project_id: proj._id, status: { $ne: 'deleted' } });
  const completed   = await Pole.countDocuments({ project_id: proj._id, status: 'completed' });
  const in_progress = await Pole.countDocuments({ project_id: proj._id, status: 'in_progress' });
  const not_started = await Pole.countDocuments({ project_id: proj._id, status: 'not_started' });
  const delayed     = await Pole.countDocuments({ project_id: proj._id, status: 'delayed' });
  const progress    = total > 0 ? Math.round((completed / total) * 100) : 0;
  const expAgg      = await Expense.aggregate([{ $match: { project_id: proj._id } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
  const totalCost   = expAgg[0] ? expAgg[0].total : 0;
  const wlCount     = await Worklog.countDocuments({ project_id: proj._id });
  const camCount    = await Camera.countDocuments({ project_id: proj._id });

  ok('Total Poles:   ' + total);
  ok('Completed:     ' + completed);
  ok('In Progress:   ' + in_progress);
  ok('Not Started:   ' + not_started);
  ok('Delayed:       ' + delayed);
  ok('Progress %:    ' + progress + '%');
  ok('Total Cost:    Rs.' + totalCost);
  ok('Worklogs:      ' + wlCount);
  ok('ANPR Cameras:  ' + camCount);

  // Delays check
  const delayedPoles = await Pole.find({ project_id: proj._id, status: { $nin: ['completed', 'not_started', 'deleted'] } });
  ok('Poles to check for delays: ' + delayedPoles.length);

  // Zone progress
  const zoneProgress = await Pole.aggregate([
    { $match: { project_id: proj._id, status: { $ne: 'deleted' } } },
    { $group: { _id: '$zone_id', total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } } } }
  ]);
  ok('Zone progress groups: ' + zoneProgress.length);

  console.log('\n══════════════════════════════════════════════════════');
  if (BUGS.length === 0) console.log('✅ ANPR Dashboard — All data seeded, no bugs');
  else { console.log('❌ BUGS: ' + BUGS.length); BUGS.forEach((b, i) => console.log('  ' + (i + 1) + '. ' + b)); }
  console.log('══════════════════════════════════════════════════════\n');

  mongoose.disconnect();
});
