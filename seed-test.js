/**
 * seed-test.js — Full sample data seed + bug detection
 * Run: node seed-test.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcrypt');

const MONGO = process.env.MONGO_URL || 'mongodb://127.0.0.1/manmove';

const Company    = require('./models/companies');
const AdminUser  = require('./models/adminuser');
const Role       = require('./models/roles');
const UserList   = require('./models/userList');
const Zone       = require('./models/zones');
const Project    = require('./models/project');
const Pole       = require('./models/pole');
const Worklog    = require('./models/worklog');
const Inventory  = require('./models/inventory');
const Contract   = require('./models/contracts');
const WorkOrder  = require('./models/workorders');
const Nvr        = require('./models/nvr');
const Camera     = require('./models/camera');
const NocAlert   = require('./models/nocAlert');
const Settings   = require('./models/settings');

const BUGS = [];
function bug(msg) { BUGS.push(msg); console.error('  ❌ BUG:', msg); }
function ok(msg)  { console.log('  ✅', msg); }

async function upsert(Model, query, data) {
  const ex = await Model.findOne(query);
  if (ex) return ex;
  return Model.create(data);
}

async function run() {
  await mongoose.connect(MONGO);
  console.log('\n🌱 Seeding Manmove sample data...\n');

  // ── 1. Companies ──────────────────────────────────────────────────────────
  console.log('── Companies');
  const compA = await upsert(Company, { name: 'TechNet ISP Pvt Ltd' }, {
    name: 'TechNet ISP Pvt Ltd', email: 'admin@technet.in', mobile: '9876500001',
    address: 'Chennai, Tamil Nadu', divisions: { isp: true, camera: false, anpr: false }, status: 'active'
  });
  const compB = await upsert(Company, { name: 'SecureVision CCTV' }, {
    name: 'SecureVision CCTV', email: 'admin@securevision.in', mobile: '9876500002',
    address: 'Coimbatore, Tamil Nadu', divisions: { isp: false, camera: true, anpr: true }, status: 'active'
  });
  ok(`Companies: ${compA.name}, ${compB.name}`);

  // ── 2. Roles ──────────────────────────────────────────────────────────────
  console.log('── Roles');
  const roleAdmin = await upsert(Role, { name: 'admin', company: compA.name }, {
    name: 'admin', company: compA.name,
    pages: ['dashboard','leads','customers','feasibility','postfeasibility','pandc','olts','inventory','users','contracts','workorders','reports','logs','threads','locate','deployments','netmap','fibermap','recordings'],
    division: ['isp'],
    actions: { create: true, update: true, delete: true, export: true, import: false, verify: true, assign: true }
  });
  const roleViewer = await upsert(Role, { name: 'viewer', company: compA.name }, {
    name: 'viewer', company: compA.name,
    pages: ['dashboard','leads','customers','reports'],
    division: ['isp'],
    actions: { create: false, update: false, delete: false, export: false, import: false, verify: false, assign: false }
  });
  const roleAnpr = await upsert(Role, { name: 'manager', company: compB.name }, {
    name: 'manager', company: compB.name,
    pages: ['dashboard','anprdashboard','anprprojects','anprpoles','anprcameras','anprworklogs','anprmaterials','anprexpenses','anprmaintenance','cameradashboard','cameraleads','camerasurvey','nvrdashboard','noc','inventory','contracts','workorders','users','reports','logs'],
    division: ['anpr','camera','surveillance'],
    actions: { create: true, update: true, delete: false, export: true, import: false, verify: true, assign: false }
  });
  ok(`Roles: ${roleAdmin.name}@${compA.name}, ${roleViewer.name}@${compA.name}, ${roleAnpr.name}@${compB.name}`);

  // ── 3. Admin Users ────────────────────────────────────────────────────────
  console.log('── Admin Users');
  const pass = await bcrypt.hash('Test@1234', 12);
  const superAdmin = await upsert(AdminUser, { email: 'superadmin@manmove.in' }, {
    name: 'Super Admin', email: 'superadmin@manmove.in', mobile: 9000000001,
    password: pass, role: 'superadmin', company: '', division: ['isp','camera','anpr','surveillance'],
    pages: [], status: 'active', tokenVersion: 0
  });
  const adminA = await upsert(AdminUser, { email: 'admin@technet.in' }, {
    name: 'Rajesh Kumar', email: 'admin@technet.in', mobile: 9000000002,
    password: pass, role: 'admin', company: compA.name, division: ['isp'],
    pages: roleAdmin.pages, status: 'active', tokenVersion: 0
  });
  const viewerA = await upsert(AdminUser, { email: 'viewer@technet.in' }, {
    name: 'Priya Viewer', email: 'viewer@technet.in', mobile: 9000000003,
    password: pass, role: 'viewer', company: compA.name, division: ['isp'],
    pages: roleViewer.pages, status: 'active', tokenVersion: 0
  });
  const adminB = await upsert(AdminUser, { email: 'admin@securevision.in' }, {
    name: 'Karthik Raj', email: 'admin@securevision.in', mobile: 9000000004,
    password: pass, role: 'manager', company: compB.name, division: ['anpr','camera','surveillance'],
    pages: roleAnpr.pages, status: 'active', tokenVersion: 0
  });
  ok(`Admin users: superadmin, ${adminA.email}, ${viewerA.email}, ${adminB.email}`);
  ok('Password for all: Test@1234');

  // ── 4. Zones ──────────────────────────────────────────────────────────────
  console.log('── Zones');
  const zoneN = await upsert(Zone, { name: 'North Chennai', company: compA.name }, { name: 'North Chennai', company: compA.name, status: 'active' });
  const zoneS = await upsert(Zone, { name: 'South Chennai', company: compA.name }, { name: 'South Chennai', company: compA.name, status: 'active' });
  const zoneCBE = await upsert(Zone, { name: 'Coimbatore Central', company: compB.name }, { name: 'Coimbatore Central', company: compB.name, status: 'active' });
  ok(`Zones: ${zoneN.name}, ${zoneS.name}, ${zoneCBE.name}`);

  // ── 5. Field Users ────────────────────────────────────────────────────────
  console.log('── Field Users');
  const fieldUsers = [
    { empId:'FU001', name:'Arjun Selvam',  role:'engineer', company: compA.name, division:['isp'],    zone: zoneN.name, mobile:9111000001, status:'active', signinstatus:'SignedIn', password:'123456', lat:13.0827, lng:80.2707 },
    { empId:'FU002', name:'Meena Devi',    role:'surveyor', company: compA.name, division:['isp'],    zone: zoneS.name, mobile:9111000002, status:'active', signinstatus:'SignedOut', password:'123456', lat:13.0500, lng:80.2500 },
    { empId:'FU003', name:'Sundar Vel',    role:'installer',company: compB.name, division:['camera'], zone: zoneCBE.name, mobile:9111000003, status:'active', signinstatus:'SignedIn', password:'123456', lat:11.0168, lng:76.9558 },
    { empId:'FU004', name:'Ravi Anand',    role:'engineer', company: compB.name, division:['anpr'],   zone: zoneCBE.name, mobile:9111000004, status:'active', signinstatus:'SignedIn', password:'123456', lat:11.0200, lng:76.9600 },
  ];
  for (const u of fieldUsers) {
    await upsert(UserList, { empId: u.empId }, u);
  }
  ok(`Field users: ${fieldUsers.map(u=>u.empId).join(', ')}`);

  // ── 6. Projects ───────────────────────────────────────────────────────────
  console.log('── Projects');
  const projA = await upsert(Project, { name: 'Chennai ANPR Phase 1', company: compB.name }, {
    name: 'Chennai ANPR Phase 1', company: compB.name, zone: zoneCBE.name,
    total_poles: 5, budget: 2500000, billed_amount: 800000,
    status: 'active', start_date: new Date('2026-01-01'), end_date: new Date('2026-06-30')
  });
  ok(`Project: ${projA.name}`);

  // ── 7. Poles ──────────────────────────────────────────────────────────────
  console.log('── Poles');
  const STAGES = ['digging','foundation','pole_installed','cabling_done','camera_installed','testing','completed'];
  const poleData = [
    { pole_number:'P001', current_stage:'completed', status:'completed', lat:11.0168, lng:76.9558 },
    { pole_number:'P002', current_stage:'cabling_done', status:'in_progress', lat:11.0180, lng:76.9570 },
    { pole_number:'P003', current_stage:'foundation', status:'in_progress', lat:11.0190, lng:76.9580 },
    { pole_number:'P004', current_stage:'not_started', status:'not_started', lat:11.0200, lng:76.9590 },
    { pole_number:'P005', current_stage:'not_started', status:'not_started', lat:11.0210, lng:76.9600 },
  ];
  const poles = [];
  for (const p of poleData) {
    const pole = await upsert(Pole, { pole_number: p.pole_number, project_id: projA._id }, {
      ...p, project_id: projA._id, zone_id: zoneCBE._id, company: compB.name,
      civil_cost: 5000, pole_cost: 18000, cable_cost: 3000, labour_cost: 2000,
      assigned_to: 'FU004'
    });
    poles.push(pole);
  }
  ok(`Poles: ${poles.map(p=>p.pole_number).join(', ')}`);

  // ── 8. Worklogs for completed pole ────────────────────────────────────────
  console.log('── Worklogs');
  for (const stage of STAGES) {
    await upsert(Worklog, { pole_id: poles[0]._id, stage }, {
      pole_id: poles[0]._id, project_id: projA._id, company: compB.name,
      stage, user_name: 'Ravi Anand', user_id: 'FU004',
      notes: `${stage} completed`, created_at: new Date()
    });
  }
  ok(`Worklogs: all 7 stages for ${poles[0].pole_number}`);

  // ── 9. NVRs ───────────────────────────────────────────────────────────────
  console.log('── NVRs');
  const nvrHW = await upsert(Nvr, { nvr_number: 'NVR-HW-001', company: compB.name }, {
    nvr_number: 'NVR-HW-001', nvr_type: 'hardware',
    brand: 'Hikvision', model: 'DS-7616NI-K2', channels: 16,
    ip_address: '192.168.1.100', rtsp_port: 554, onvif_port: 80,
    stream_protocol: 'rtsp', company: compB.name, project_id: projA._id,
    location: 'Server Room A', status: 'online', last_seen: new Date(),
    hdd_slots: [
      { slot: 1, model: 'WD Purple 4TB', serial: 'WD-001', capacity_tb: 4, used_tb: 1.2, temperature_c: 38, health_status: 'good', power_on_hours: 2400, reallocated_sectors: 0 },
      { slot: 2, model: 'WD Purple 4TB', serial: 'WD-002', capacity_tb: 4, used_tb: 0.8, temperature_c: 40, health_status: 'good', power_on_hours: 2400, reallocated_sectors: 0 }
    ],
    recording_mode: 'continuous', retention_days: 30, overwrite_policy: 'oldest_first',
    daily_write_gb: 12, days_until_full: 510
  });
  const nvrSW = await upsert(Nvr, { nvr_number: 'NVR-SW-001', company: compB.name }, {
    nvr_number: 'NVR-SW-001', nvr_type: 'software', vms_type: 'shinobi',
    health_endpoint: 'http://192.168.1.200:8080/api/health',
    ip_address: '192.168.1.200', stream_protocol: 'rtsp',
    company: compB.name, project_id: projA._id,
    location: 'Cloud VMS Server', status: 'online', last_seen: new Date(),
    channels: 32, recording_mode: 'motion', retention_days: 14
  });
  // Pair failover
  await Nvr.findByIdAndUpdate(nvrHW._id, { failover_nvr_id: nvrSW._id, is_failover: false });
  await Nvr.findByIdAndUpdate(nvrSW._id, { failover_nvr_id: nvrHW._id, is_failover: true });
  ok(`NVRs: ${nvrHW.nvr_number} (hardware, primary) ↔ ${nvrSW.nvr_number} (software, standby)`);

  // ── 10. Cameras ───────────────────────────────────────────────────────────
  console.log('── Cameras');
  const camData = [
    { camera_number:'CAM-001', pole_id: poles[0]._id, nvr_id: nvrHW._id, nvr_channel: 1, ip_address:'192.168.1.101', current_stage:'completed', status:'completed' },
    { camera_number:'CAM-002', pole_id: poles[1]._id, nvr_id: nvrHW._id, nvr_channel: 2, ip_address:'192.168.1.102', current_stage:'ip_configured', status:'in_progress' },
    { camera_number:'CAM-003', pole_id: poles[2]._id, nvr_id: nvrSW._id, nvr_channel: 1, ip_address:'192.168.1.103', current_stage:'mounted', status:'in_progress' },
  ];
  for (const c of camData) {
    await upsert(Camera, { camera_number: c.camera_number, company: compB.name }, {
      ...c, project_id: projA._id, company: compB.name, monitoring_enabled: true
    });
  }
  ok(`Cameras: ${camData.map(c=>c.camera_number).join(', ')}`);

  // ── 11. NOC Alert ─────────────────────────────────────────────────────────
  console.log('── NOC Alerts');
  await upsert(NocAlert, { description: /CAM-002.*offline/, resolved_at: null }, {
    severity: 'warning', company: compB.name,
    description: 'CAM-002 stream error — no response for 3 checks',
    source: 'camera-monitor', acknowledged: false, triggered_at: new Date()
  });
  ok('NOC alert: CAM-002 stream warning');

  // ── 12. Contracts ─────────────────────────────────────────────────────────
  console.log('── Contracts');
  const contract = await upsert(Contract, { contract_number: 'ANPR-2026-9001', company: compB.name }, {
    contract_number: 'ANPR-2026-9001', company: compB.name, division: 'anpr',
    client_name: 'Chennai Traffic Police', start_date: new Date('2026-01-01'),
    end_date: new Date('2026-12-31'), resolution_sla_hours: 4, status: 'active'
  });
  await upsert(WorkOrder, { ticket_number: 'WO-2026-9001', company: compB.name }, {
    ticket_number: 'WO-2026-9001', company: compB.name,
    contract_id: contract._id, status: 'open',
    reported_at: new Date(), sla_breached: false
  });
  ok(`Contract: ${contract.contract_number} + 1 open work order`);

  // ── 13. Inventory ─────────────────────────────────────────────────────────
  console.log('── Inventory');
  const invItems = [
    { name:'Hikvision 4MP ANPR Cam', type:'anprcamera', serialNumber:'ANC-001', assetTag:'SV-ANC-001', company: compB.name, division:'anpr', zone: zoneCBE.name, lifecycleStatus:'in_service', condition:'good', vendor:'Hikvision', purchaseCost:45000, warrantyExpiry: new Date('2028-01-01') },
    { name:'WD Purple 4TB HDD',      type:'hdd',        serialNumber:'WD-HDD-001', assetTag:'SV-HDD-001', company: compB.name, division:'surveillance', zone: zoneCBE.name, lifecycleStatus:'in_service', condition:'good', vendor:'WD', purchaseCost:8500 },
    { name:'GI Pole 6m',             type:'pole',       serialNumber:'POL-SV-001', assetTag:'SV-POL-001', company: compB.name, division:'anpr', zone: zoneCBE.name, lifecycleStatus:'deployed', condition:'good', vendor:'Steel Corp', purchaseCost:4500 },
    { name:'Huawei OLT MA5608T',     type:'olt',        serialNumber:'OLT-TN-001', assetTag:'TN-OLT-001', company: compA.name, division:'isp', zone: zoneN.name, lifecycleStatus:'in_service', condition:'good', vendor:'Huawei', purchaseCost:85000, warrantyExpiry: new Date('2027-06-01') },
    { name:'TP-Link 24P Switch',     type:'switch',     serialNumber:'SW-TN-001',  assetTag:'TN-SW-001',  company: compA.name, division:'isp', zone: zoneN.name, lifecycleStatus:'in_service', condition:'good', vendor:'TP-Link', purchaseCost:12000 },
  ];
  for (const item of invItems) {
    await upsert(Inventory, { serialNumber: item.serialNumber }, { ...item, status: 'active' });
  }
  ok(`Inventory: ${invItems.length} items across both companies`);

  // ── 14. Brand Settings ────────────────────────────────────────────────────
  console.log('── Settings');
  await upsert(Settings, { company: compA.name }, { company: compA.name, brand: { companyName: 'TechNet ISP', primaryColor: '#1976D2', logoUrl: '' } });
  await upsert(Settings, { company: compB.name }, { company: compB.name, brand: { companyName: 'SecureVision', primaryColor: '#E53935', logoUrl: '' } });
  ok('Brand settings for both companies');

  // ── Bug Checks ────────────────────────────────────────────────────────────
  console.log('\n🔍 Running bug checks...\n');

  // Check 1: Cross-company data isolation
  const compAInventory = await Inventory.find({ company: compA.name });
  const compBInventory = await Inventory.find({ company: compB.name });
  if (compAInventory.some(i => i.company !== compA.name)) bug('CompanyA inventory contains wrong company data');
  else ok(`Data isolation: CompanyA has ${compAInventory.length} items, CompanyB has ${compBInventory.length} items`);

  // Check 2: Roles scoped to company
  const rolesA = await Role.find({ company: compA.name });
  const rolesB = await Role.find({ company: compB.name });
  if (rolesA.some(r => r.company !== compA.name)) bug('CompanyA roles contain wrong company');
  else ok(`Role scoping: CompanyA ${rolesA.length} roles, CompanyB ${rolesB.length} roles`);

  // Check 3: Admin users scoped to company
  const adminsA = await AdminUser.find({ company: compA.name });
  const adminsB = await AdminUser.find({ company: compB.name });
  if (adminsA.some(a => a.company !== compA.name)) bug('CompanyA admin users contain wrong company');
  else ok(`Admin scoping: CompanyA ${adminsA.length} admins, CompanyB ${adminsB.length} admins`);

  // Check 4: Superadmin has no company
  const sa = await AdminUser.findOne({ email: 'superadmin@manmove.in' });
  if (sa.company !== '') bug(`SuperAdmin should have empty company, got: "${sa.company}"`);
  else ok('SuperAdmin company field is empty (correct)');

  // Check 5: tokenVersion exists on all admin users — patch missing ones
  const noTokenVersion = await AdminUser.find({ tokenVersion: { $exists: false } });
  if (noTokenVersion.length) {
    await AdminUser.updateMany({ tokenVersion: { $exists: false } }, { $set: { tokenVersion: 0 } });
    bug(`${noTokenVersion.length} admin users were missing tokenVersion — patched to 0`);
  } else ok('All admin users have tokenVersion field');

  // Check 6: Roles have company+name index (check via explain)
  const roleExplain = await Role.find({ company: compA.name }).explain('executionStats');
  const usedIndex = roleExplain?.executionStats?.executionStages?.inputStage?.indexName || 'unknown';
  ok(`Role query index: ${usedIndex}`);

  // Check 7: Pole stages are in correct order for completed pole
  const poleLogs = await Worklog.find({ pole_id: poles[0]._id }).sort({ created_at: 1 });
  const logStages = poleLogs.map(l => l.stage);
  const expectedOrder = ['digging','foundation','pole_installed','cabling_done','camera_installed','testing','completed'];
  const stagesMatch = expectedOrder.every((s, i) => logStages[i] === s);
  if (!stagesMatch) bug(`Pole stage order wrong: ${logStages.join(' → ')}`);
  else ok(`Pole stage workflow: ${logStages.join(' → ')}`);

  // Check 8: NVR failover pairing
  const nvrPrimary = await Nvr.findById(nvrHW._id);
  const nvrStandby = await Nvr.findById(nvrSW._id);
  if (!nvrPrimary.failover_nvr_id) bug('Primary NVR missing failover_nvr_id');
  else if (!nvrStandby.is_failover) bug('Standby NVR is_failover should be true');
  else ok(`NVR failover: ${nvrHW.nvr_number} (primary) ↔ ${nvrSW.nvr_number} (standby)`);

  // Check 9: Hardware NVR has ip_address, software has health_endpoint
  const hwNvr = await Nvr.findOne({ nvr_type: 'hardware', company: compB.name });
  const swNvr = await Nvr.findOne({ nvr_type: 'software', company: compB.name });
  if (!hwNvr?.ip_address) bug('Hardware NVR missing ip_address');
  else ok(`Hardware NVR ip_address: ${hwNvr.ip_address}`);
  if (!swNvr?.health_endpoint) bug('Software NVR missing health_endpoint');
  else ok(`Software NVR health_endpoint: ${swNvr.health_endpoint}`);

  // Check 10: Contract SLA hours set
  const c = await Contract.findOne({ company: compB.name });
  if (!c?.resolution_sla_hours) bug('Contract missing resolution_sla_hours');
  else ok(`Contract SLA: ${c.resolution_sla_hours}h`);

  // Check 11: Passwords are hashed
  const adminUser = await AdminUser.findOne({ email: 'admin@technet.in' });
  if (!adminUser.password.startsWith('$2')) bug('Admin password is NOT hashed!');
  else ok('Passwords are bcrypt hashed');

  // Check 12: Inventory items have company field
  const invNoCompany = await Inventory.find({ company: { $exists: false } });
  if (invNoCompany.length) bug(`${invNoCompany.length} inventory items missing company field`);
  else ok('All inventory items have company field');

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════');
  if (BUGS.length === 0) {
    console.log('✅ ALL CHECKS PASSED — No bugs found');
  } else {
    console.log(`❌ ${BUGS.length} BUG(S) FOUND:`);
    BUGS.forEach((b, i) => console.log(`  ${i+1}. ${b}`));
  }
  console.log('══════════════════════════════════════\n');

  console.log('📋 Test Login Credentials:');
  console.log('  SuperAdmin:  superadmin@manmove.in  / Test@1234');
  console.log('  CompanyA Admin:  admin@technet.in   / Test@1234  (ISP division)');
  console.log('  CompanyA Viewer: viewer@technet.in  / Test@1234  (read-only)');
  console.log('  CompanyB Admin:  admin@securevision.in / Test@1234  (ANPR+Camera+Surveillance)');
  console.log('  Field User:  empId=FU001  / 123456\n');

  await mongoose.disconnect();
}

run().catch(e => { console.error('Seed failed:', e.message); process.exit(1); });
