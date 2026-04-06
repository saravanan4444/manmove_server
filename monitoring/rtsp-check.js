const net = require('net');

function checkRtsp(ip, port = 554, timeoutMs = 3000) {
  return new Promise(resolve => {
    const sock = new net.Socket();
    const done = (result) => { sock.destroy(); resolve(result); };
    sock.setTimeout(timeoutMs);
    sock.connect(port, ip, () => done(true));
    sock.on('error', () => done(false));
    sock.on('timeout', () => done(false));
  });
}

module.exports = { checkRtsp };
