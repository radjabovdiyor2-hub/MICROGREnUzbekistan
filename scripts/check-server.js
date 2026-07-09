const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const file = 'apps/web/public/manifest.json';
    sftp.fastPut(path.join(__dirname, file), '/home/ubuntu/MICROGREnUzbekistan/' + file, (e) => {
      if (e) { console.error(e); return conn.end(); }
      console.log('manifest.json uploaded');
      conn.exec('cp /home/ubuntu/MICROGREnUzbekistan/apps/web/public/manifest.json /home/ubuntu/MICROGREnUzbekistan/apps/web/.next/standalone/apps/web/public/manifest.json 2>/dev/null; echo done', (e, s) => {
        s.on('data', d => process.stdout.write(d.toString()));
        s.on('close', () => conn.end());
      });
    });
  });
}).connect({ host:'82.115.50.30', username:'ubuntu', password:process.env.DEPLOY_PASS, algorithms:{serverHostKey:['ssh-ed25519','ecdsa-sha2-nistp256','ssh-rsa']}, hostVerifier:()=>true });
