const { Client } = require('ssh2');

const conn = new Client();

conn.on('ready', () => {
  conn.exec('cat /home/ubuntu/MICROGREnUzbekistan/.env', (err, stream) => {
    if (err) throw err;
    let out = '';
    stream.on('data', (data) => { out += data; });
    stream.on('close', () => {
      console.log("--- REMOTE .ENV ---");
      console.log(out);
      conn.end();
    });
  });
}).connect({
  host: process.env.DEPLOY_HOST || '82.115.50.30',
  username: process.env.DEPLOY_USER || 'ubuntu',
  password: process.env.DEPLOY_PASS,
  algorithms: { serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'ssh-rsa'] }
});
