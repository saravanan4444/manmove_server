const { exec } = require('child_process');

function pingHost(ip, timeoutMs = 2000) {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve({ alive: false, latency: null }), timeoutMs + 500);
    exec(`ping -c 1 -W 2 ${ip}`, (err, stdout) => {
      clearTimeout(t);
      if (err) return resolve({ alive: false, latency: null });
      const m = stdout.match(/time=([\d.]+)\s*ms/);
      resolve({ alive: true, latency: m ? parseFloat(m[1]) : null });
    });
  });
}

module.exports = { pingHost };
