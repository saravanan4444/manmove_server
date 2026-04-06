/**
 * defaultRoles.js
 * 7-level role hierarchy — auto-created when a company is registered.
 * Company Admin can view and edit from Settings → Roles & Permissions.
 *
 * Level 6 — General Manager      (full company control, no settings)
 * Level 5 — Operations Manager   (all ops, can delete, can export)
 * Level 4 — Supervisor           (all ops, no delete, no financials)
 * Level 3 — Team Leader          (own division ops, can assign tasks)
 * Level 2 — Field Engineer       (field work only, no delete)
 * Level 1 — Customer Care        (leads + customers read/update only)
 * Level 0 — Viewer               (read-only, sensitive fields hidden)
 */

const SHARED = [
  'dashboard','threads','locate','deployments','netmap','fibermap',
  'inventory','recordings','reports','logs','users','userlist','vendor',
  'contracts','workorders',
];
const ISP_PAGES  = ['ispdashboard','leads','feasibility','postfeasibility','pandc','customers','olts'];
const CAM_PAGES  = ['cameradashboard','cameraleads','camerasurvey','postcamerasurvey','camerainstall','cameracustomers'];
const ANPR_PAGES = ['anprdashboard','anprprojects','anprpoles','anprcameras','anprmaintenance','anprworklogs','anprmaterials','anprexpenses','anprsystemlogs'];
const SURV_PAGES = ['nvrdashboard','noc'];

const FINANCIAL_FIELDS = ['budget','billed_amount','cost','civil_cost','pole_cost','cable_cost','labour_cost'];
const SENSITIVE_FIELDS  = [...FINANCIAL_FIELDS, 'salary'];
const PRIVATE_FIELDS    = [...SENSITIVE_FIELDS, 'password', 'mobile', 'email'];

function pick(arr, keys) { return arr.filter(p => keys.includes(p)); }

function buildPages(divisions, groups) {
  const out = [];
  if (groups.includes('shared'))          out.push(...SHARED);
  if (groups.includes('isp')          && divisions.isp)          out.push(...ISP_PAGES);
  if (groups.includes('camera')       && divisions.camera)       out.push(...CAM_PAGES);
  if (groups.includes('anpr')         && divisions.anpr)         out.push(...ANPR_PAGES);
  if (groups.includes('surveillance') && divisions.surveillance) out.push(...SURV_PAGES);
  return [...new Set(out)];
}

function getDefaultRoles(company, divisions = { isp: true }) {
  const activeDivs = Object.keys(divisions).filter(k => divisions[k]);
  const allGroups  = ['shared','isp','camera','anpr','surveillance'];
  const allPages   = buildPages(divisions, allGroups);

  // Field-work pages per division
  const fieldPages = [
    'dashboard','threads','locate','deployments','inventory',
    ...pick(ISP_PAGES,  ['leads','feasibility','postfeasibility','pandc','customers']),
    ...pick(CAM_PAGES,  ['cameraleads','camerasurvey','postcamerasurvey','camerainstall']),
    ...pick(ANPR_PAGES, ['anprpoles','anprworklogs','anprmaterials']),
  ].filter(p => allPages.includes(p));

  // CC pages — ISP customer-facing only
  const ccPages = pick(allPages, ['dashboard','ispdashboard','leads','customers','threads','reports']);

  return [
    // ── Level 6: General Manager ─────────────────────────────────────────
    {
      name: 'general_manager',
      company,
      pages: allPages,
      actions: { create:true, update:true, delete:true,  export:true,  import:true,  verify:true,  assign:true  },
      hiddenFields: [],
      division: activeDivs,
    },

    // ── Level 5: Operations Manager ──────────────────────────────────────
    {
      name: 'operations_manager',
      company,
      pages: allPages,
      actions: { create:true, update:true, delete:true,  export:true,  import:false, verify:true,  assign:true  },
      hiddenFields: [],
      division: activeDivs,
    },

    // ── Level 4: Supervisor ───────────────────────────────────────────────
    {
      name: 'supervisor',
      company,
      pages: allPages,
      actions: { create:true, update:true, delete:false, export:true,  import:false, verify:true,  assign:true  },
      hiddenFields: FINANCIAL_FIELDS,
      division: activeDivs,
    },

    // ── Level 3: Team Leader ──────────────────────────────────────────────
    {
      name: 'team_leader',
      company,
      pages: buildPages(divisions, ['isp','camera','anpr','surveillance']).concat(['dashboard','threads','locate','deployments','inventory','reports']),
      actions: { create:true, update:true, delete:false, export:true,  import:false, verify:true,  assign:true  },
      hiddenFields: SENSITIVE_FIELDS,
      division: activeDivs,
    },

    // ── Level 2: Field Engineer ───────────────────────────────────────────
    {
      name: 'field_engineer',
      company,
      pages: fieldPages,
      actions: { create:true, update:true, delete:false, export:false, import:false, verify:true,  assign:false },
      hiddenFields: SENSITIVE_FIELDS,
      division: activeDivs,
    },

    // ── Level 1: Customer Care ────────────────────────────────────────────
    {
      name: 'customer_care',
      company,
      pages: ccPages,
      actions: { create:true, update:true, delete:false, export:false, import:false, verify:false, assign:false },
      hiddenFields: PRIVATE_FIELDS,
      division: divisions.isp ? ['isp'] : activeDivs.slice(0,1),
    },

    // ── Level 0: Viewer ───────────────────────────────────────────────────
    {
      name: 'viewer',
      company,
      pages: ['dashboard','reports','logs'],
      actions: { create:false, update:false, delete:false, export:false, import:false, verify:false, assign:false },
      hiddenFields: PRIVATE_FIELDS,
      division: activeDivs,
    },
  ];
}

module.exports = { getDefaultRoles };
