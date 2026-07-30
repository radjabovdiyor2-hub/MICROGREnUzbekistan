const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  conn.exec('pm2 logs microgreen-bot --lines 20 --nostream', (err, stream) => {
    if (err) throw err;
    stream.on('data', (d) => process.stdout.write(d));
    stream.stderr.on('data', (d) => process.stderr.write(d));
    stream.on('close', () => conn.end());
  });
}).connect({ 
  host: process.env.DEPLOY_HOST || '82.115.50.30', username: process.env.DEPLOY_USER || 'ubuntu', password: process.env.DEPLOY_PASS, algorithms: { serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'ssh-rsa'] }, hostVerifier: () => true 
});
