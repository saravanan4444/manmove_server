module.exports = {
  apps: [{
    name: 'manmove-server',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3010,
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
// NOTE: PM2 does NOT auto-load .env — use one of:
//   1. dotenv in server.js (already handled if require('dotenv').config() is at top)
//   2. pm2 start ecosystem.config.js --env production
//   3. Or set env vars in the OS before starting PM2
