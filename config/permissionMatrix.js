/**
 * permissionMatrix.js
 * 7-level permission tier system.
 *
 * Tiers (0 → 6):
 *   0 — viewer
 *   1 — customer_care
 *   2 — field_engineer
 *   3 — team_leader
 *   4 — supervisor
 *   5 — operations_manager
 *   6 — general_manager  (company-level top)
 *  (7 — admin / superadmin — platform level, bypasses all checks)
 */

const TIERS = ['viewer','customer_care','field_engineer','team_leader','supervisor','operations_manager','general_manager'];

const MATRIX = {
    // Companies — platform only
    'companies:create':   'superadmin',
    'companies:update':   'superadmin',
    'companies:delete':   'superadmin',
    'companies:read':     'general_manager',

    // Roles & admin users — general manager and above
    'roles:create':       'general_manager',
    'roles:update':       'general_manager',
    'roles:delete':       'general_manager',
    'roles:read':         'supervisor',

    'adminuser:create':   'general_manager',
    'adminuser:update':   'general_manager',
    'adminuser:delete':   'general_manager',
    'adminuser:read':     'supervisor',

    // Field users
    'users:create':       'supervisor',
    'users:update':       'supervisor',
    'users:delete':       'operations_manager',
    'users:read':         'team_leader',

    // Leads
    'leads:create':       'customer_care',
    'leads:update':       'customer_care',
    'leads:delete':       'supervisor',
    'leads:read':         'viewer',

    // Customers
    'customers:create':   'customer_care',
    'customers:update':   'customer_care',
    'customers:delete':   'supervisor',
    'customers:read':     'viewer',

    // Inventory
    'inventory:create':   'field_engineer',
    'inventory:update':   'field_engineer',
    'inventory:delete':   'supervisor',
    'inventory:read':     'viewer',

    // Projects / ANPR
    'projects:create':    'team_leader',
    'projects:update':    'field_engineer',
    'projects:delete':    'operations_manager',
    'projects:read':      'viewer',

    // Contracts
    'contracts:create':   'supervisor',
    'contracts:update':   'supervisor',
    'contracts:delete':   'operations_manager',
    'contracts:read':     'viewer',

    // Reports
    'reports:read':       'viewer',
    'reports:export':     'team_leader',

    // Settings — platform only
    'settings:read':      'superadmin',
    'settings:update':    'superadmin',
};

function getTierIndex(role) {
    if (!role) return -1;
    const r = role.toLowerCase();
    if (['superadmin','administrator'].includes(r)) return 8;
    if (r === 'admin')              return 7;
    if (r === 'general_manager')    return 6;
    if (r === 'operations_manager') return 5;
    if (r === 'supervisor')         return 4;
    if (r === 'team_leader')        return 3;
    if (r === 'field_engineer')     return 2;
    if (r === 'customer_care')      return 1;
    if (r === 'viewer')             return 0;
    // legacy aliases
    if (r === 'manager')            return 4;
    if (r === 'editor')             return 2;
    // custom roles default to field_engineer tier
    return 2;
}

function canDo(userRole, resource, action, jwtActions = {}) {
    const key = `${resource}:${action}`;
    if (jwtActions[action] !== undefined) return jwtActions[action] === true;
    const required = MATRIX[key];
    if (!required) return false;
    return getTierIndex(userRole) >= getTierIndex(required);
}

module.exports = { MATRIX, TIERS, getTierIndex, canDo };
