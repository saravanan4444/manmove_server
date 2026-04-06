var mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1/manmove', { useNewUrlParser: true, useUnifiedTopology: true });
var Customer = require('./models/customers');

// 20 Tirupur customers across all ISP stages
// Tirupur center ~11.1085, 77.3411
var customers = [
  // LEADS (stage: lead)
  { firstname:'Selvam',   lastname:'K',       mobile:'9876500001', address:'14 Nehru St, Tirupur',          zone:'North Zone', area:'Nehru Nagar',    plantype:'Unlimited', speed:'100 Mbps', lat:11.1200, lng:77.3480, stage:'lead',          status:'active', division:'isp', company:'ManMove Networks' },
  { firstname:'Kavitha',  lastname:'R',       mobile:'9876500002', address:'7 Anna Nagar, Tirupur',          zone:'South Zone', area:'Anna Nagar',     plantype:'FUP',       speed:'50 Mbps',  lat:11.0950, lng:77.3300, stage:'lead',          status:'active', division:'isp', company:'ManMove Networks' },
  { firstname:'Balamurugan',lastname:'S',     mobile:'9876500003', address:'22 Gandhi Road, Tirupur',        zone:'North Zone', area:'Gandhi Nagar',   plantype:'Unlimited', speed:'200 Mbps', lat:11.1150, lng:77.3450, stage:'lead',          status:'active', division:'isp', company:'ManMove Networks' },
  { firstname:'Preethi',  lastname:'M',       mobile:'9876500004', address:'5 Kovai Road, Tirupur',          zone:'East Zone',  area:'Kovai Road',     plantype:'FUP',       speed:'25 Mbps',  lat:11.1050, lng:77.3600, stage:'lead',          status:'active', division:'isp', company:'ManMove Networks' },

  // FEASIBILITY (stage: inprogress)
  { firstname:'Murugesan',lastname:'P',       mobile:'9876500005', address:'33 Palladam Road, Tirupur',      zone:'South Zone', area:'Palladam Road',  plantype:'Unlimited', speed:'100 Mbps', lat:11.0900, lng:77.3250, stage:'inprogress',    status:'active', division:'isp', company:'ManMove Networks', surveyby:'EMP003', surveydate:'2026-03-20', visitstatus:'Visited', feasibility:'Feasible', distanceolt:850, nearestolt:'Huawei OLT MA5608T', signalstrength:'-16 dBm', cablelength:935 },
  { firstname:'Lakshmi',  lastname:'D',       mobile:'9876500006', address:'18 Tiruppur Main Rd',            zone:'North Zone', area:'Main Road',      plantype:'FUP',       speed:'50 Mbps',  lat:11.1180, lng:77.3520, stage:'inprogress',    status:'active', division:'isp', company:'ManMove Networks', surveyby:'EMP003', surveydate:'2026-03-21', visitstatus:'Visited', feasibility:'Feasible', distanceolt:620, nearestolt:'Huawei OLT MA5608T', signalstrength:'-14 dBm', cablelength:682 },
  { firstname:'Dinesh',   lastname:'T',       mobile:'9876500007', address:'9 Veerapandi Road, Tirupur',     zone:'West Zone',  area:'Veerapandi',     plantype:'Unlimited', speed:'100 Mbps', lat:11.1000, lng:77.3150, stage:'inprogress',    status:'active', division:'isp', company:'ManMove Networks', surveyby:'EMP003', surveydate:'2026-03-22', visitstatus:'Visited', feasibility:'Partially Feasible', distanceolt:4200, nearestolt:'Huawei OLT MA5608T', signalstrength:'-22 dBm', cablelength:4620 },

  // POST FEASIBILITY (stage: commissioning)
  { firstname:'Anbu',     lastname:'V',       mobile:'9876500008', address:'45 Avinashi Road, Tirupur',      zone:'North Zone', area:'Avinashi Road',  plantype:'Unlimited', speed:'200 Mbps', lat:11.1220, lng:77.3490, stage:'commissioning', status:'active', division:'isp', company:'ManMove Networks', surveyby:'EMP003', feasibility:'Feasible', distanceolt:780, routetype:'Aerial', routelength:858, fiberlength:858, splittertype:'1:8', estimatedcost:4500, installcharge:1500, approvalstatus:'Approved', approvedby:'EMP001', scheduleddate:'2026-03-26', assignedtech:'EMP003', fibercableid:'CAB-001', fibercores:'8' },
  { firstname:'Saranya',  lastname:'N',       mobile:'9876500009', address:'12 Kumaran Road, Tirupur',       zone:'South Zone', area:'Kumaran Nagar',  plantype:'FUP',       speed:'50 Mbps',  lat:11.0980, lng:77.3350, stage:'commissioning', status:'active', division:'isp', company:'ManMove Networks', surveyby:'EMP003', feasibility:'Feasible', distanceolt:1100, routetype:'Aerial', routelength:1210, fiberlength:1210, splittertype:'1:8', estimatedcost:5200, installcharge:1500, approvalstatus:'Approved', approvedby:'EMP001', scheduleddate:'2026-03-27', assignedtech:'EMP003' },
  { firstname:'Karthikeyan',lastname:'B',     mobile:'9876500010', address:'67 Sathy Road, Tirupur',         zone:'East Zone',  area:'Sathy Road',     plantype:'Unlimited', speed:'100 Mbps', lat:11.1080, lng:77.3650, stage:'commissioning', status:'active', division:'isp', company:'ManMove Networks', surveyby:'EMP003', feasibility:'Feasible', distanceolt:950, routetype:'Underground', routelength:1045, fiberlength:1045, splittertype:'1:4', estimatedcost:6800, installcharge:2000, approvalstatus:'Pending', scheduleddate:'2026-03-28' },

  // P&C (stage: pandc)
  { firstname:'Vijayalakshmi',lastname:'S',   mobile:'9876500011', address:'3 Periyar Nagar, Tirupur',       zone:'North Zone', area:'Periyar Nagar',  plantype:'Unlimited', speed:'100 Mbps', lat:11.1160, lng:77.3460, stage:'pandc',         status:'active', division:'isp', company:'ManMove Networks', feasibility:'Feasible', distanceolt:700, routetype:'Aerial', routelength:770, leadtech:'EMP003', supporttech:'EMP001', installdate:'2026-03-23', installstatus:'Completed', ontmodel:'Huawei HG8245H', ontserial:'ONT-TEST-001', ontmac:'AA:BB:CC:11:22:33', ponport:'OLT-01/Port-2', onupower:'-17 dBm', colorcode:'Blue-White', fiberused:770, splitterinstalled:'1:8', splitterloc:'Pole-007', speedtest:'98 Mbps / 95 Mbps', ping:4, testresult:'Pass', customeracceptance:'Accepted', activationdate:'2026-03-23', monthlycharge:699, installcollected:1500, securitydeposit:500 },
  { firstname:'Ramesh',   lastname:'G',       mobile:'9876500012', address:'28 Tirupur North, Tirupur',      zone:'North Zone', area:'Tirupur North',  plantype:'FUP',       speed:'50 Mbps',  lat:11.1230, lng:77.3510, stage:'pandc',         status:'active', division:'isp', company:'ManMove Networks', feasibility:'Feasible', distanceolt:550, routetype:'Aerial', routelength:605, leadtech:'EMP003', installdate:'2026-03-24', installstatus:'In Progress', ontmodel:'ZTE F660', ontserial:'ONT-TEST-002', fiberused:605, splitterinstalled:'1:8', testresult:'Pass', customeracceptance:'Pending' },
  { firstname:'Meenakshi',lastname:'A',       mobile:'9876500013', address:'15 Kongu Nagar, Tirupur',        zone:'South Zone', area:'Kongu Nagar',    plantype:'Unlimited', speed:'200 Mbps', lat:11.0960, lng:77.3280, stage:'pandc',         status:'active', division:'isp', company:'ManMove Networks', feasibility:'Feasible', distanceolt:1300, routetype:'Mixed', routelength:1430, leadtech:'EMP003', installdate:'2026-03-25', installstatus:'Scheduled', ontmodel:'Huawei HG8245H' },

  // ACTIVE CUSTOMERS (stage: customer)
  { firstname:'Suresh',   lastname:'P',       mobile:'9876500014', address:'8 Bharathi Nagar, Tirupur',      zone:'North Zone', area:'Bharathi Nagar', plantype:'Unlimited', speed:'100 Mbps', lat:11.1190, lng:77.3500, stage:'customer',      status:'active', division:'isp', company:'ManMove Networks', ontserial:'ONT-CUST-001', activationdate:'2026-03-15', monthlycharge:699, username:'suresh.p@manmove' },
  { firstname:'Geetha',   lastname:'R',       mobile:'9876500015', address:'41 Kamaraj Road, Tirupur',       zone:'South Zone', area:'Kamaraj Road',   plantype:'FUP',       speed:'50 Mbps',  lat:11.0970, lng:77.3320, stage:'customer',      status:'active', division:'isp', company:'ManMove Networks', ontserial:'ONT-CUST-002', activationdate:'2026-03-10', monthlycharge:499, username:'geetha.r@manmove' },
  { firstname:'Pandian',  lastname:'M',       mobile:'9876500016', address:'19 Erode Road, Tirupur',         zone:'East Zone',  area:'Erode Road',     plantype:'Unlimited', speed:'200 Mbps', lat:11.1060, lng:77.3620, stage:'customer',      status:'active', division:'isp', company:'ManMove Networks', ontserial:'ONT-CUST-003', activationdate:'2026-03-08', monthlycharge:999, username:'pandian.m@manmove' },
  { firstname:'Revathi',  lastname:'K',       mobile:'9876500017', address:'6 Noyyal Street, Tirupur',       zone:'North Zone', area:'Noyyal Nagar',   plantype:'FUP',       speed:'25 Mbps',  lat:11.1140, lng:77.3440, stage:'customer',      status:'active', division:'isp', company:'ManMove Networks', ontserial:'ONT-CUST-004', activationdate:'2026-03-05', monthlycharge:299, username:'revathi.k@manmove' },
  { firstname:'Arumugam', lastname:'S',       mobile:'9876500018', address:'55 Velampalayam, Tirupur',       zone:'South Zone', area:'Velampalayam',   plantype:'Unlimited', speed:'100 Mbps', lat:11.0930, lng:77.3270, stage:'customer',      status:'active', division:'isp', company:'ManMove Networks', ontserial:'ONT-CUST-005', activationdate:'2026-02-28', monthlycharge:699, username:'arumugam.s@manmove' },
  { firstname:'Nirmala',  lastname:'V',       mobile:'9876500019', address:'30 Perumal Kovil St, Tirupur',   zone:'East Zone',  area:'Perumal Kovil',  plantype:'FUP',       speed:'50 Mbps',  lat:11.1030, lng:77.3580, stage:'customer',      status:'active', division:'isp', company:'ManMove Networks', ontserial:'ONT-CUST-006', activationdate:'2026-02-20', monthlycharge:499, username:'nirmala.v@manmove' },
  { firstname:'Tamilarasan',lastname:'R',     mobile:'9876500020', address:'77 Dharapuram Road, Tirupur',    zone:'West Zone',  area:'Dharapuram Road',plantype:'Unlimited', speed:'200 Mbps', lat:11.1010, lng:77.3180, stage:'customer',      status:'active', division:'isp', company:'ManMove Networks', ontserial:'ONT-CUST-007', activationdate:'2026-02-15', monthlycharge:999, username:'tamilarasan.r@manmove' },
];

mongoose.connection.once('open', async function() {
  var inserted = 0;
  for (var c of customers) {
    var ex = await Customer.findOne({ mobile: c.mobile });
    if (!ex) { await Customer.create(c); inserted++; }
  }
  console.log('Inserted:', inserted, 'customers');

  // Print stage summary
  var stages = ['lead','inprogress','commissioning','pandc','customer'];
  for (var s of stages) {
    var count = await Customer.countDocuments({ stage: s, division: 'isp' });
    console.log(s + ':', count);
  }
  mongoose.disconnect();
});
