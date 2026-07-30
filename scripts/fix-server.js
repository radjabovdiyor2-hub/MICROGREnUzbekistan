const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const uploads = [
      ['apps/web/public/logo.png', '/home/ubuntu/MICROGREnUzbekistan/apps/web/public/logo.png'],
      ['apps/web/public/icons/icon-512.png', '/home/ubuntu/MICROGREnUzbekistan/apps/web/public/icons/icon-512.png'],
    ];
    let i = 0;
    function next() {
      if (i >= uploads.length) { copyAndRestart(); return; }
      const [l, r] = uploads[i];
      sftp.fastPut(path.join(__dirname, l), r, (e) => {
        console.log(e ? 'FAIL: ' + l : 'OK: ' + l);
        i++; next();
      });
    }
    next();
  });

  function copyAndRestart() {
    const cmds = [
      'cp /home/ubuntu/MICROGREnUzbekistan/apps/web/public/logo.png /home/ubuntu/MICROGREnUzbekistan/apps/web/.next/standalone/apps/web/public/logo.png 2>/dev/null; true',
      'cp /home/ubuntu/MICROGREnUzbekistan/apps/web/public/icons/icon-512.png /home/ubuntu/MICROGREnUzbekistan/apps/web/.next/standalone/apps/web/public/icons/icon-512.png 2>/dev/null; true',
      'pm2 restart microgreen-web --update-env 2>&1 | tail -1',
      'sleep 2 && curl -s -o /dev/null -w "HTTP: %{http_code}\\n" http://127.0.0.1:3002',
    ];
    let j = 0;
    const run = () => {
      if (j >= cmds.length) { console.log('DONE!'); return conn.end(); }
      conn.exec(cmds[j++], (e, s) => {
        if (e) { console.error(e); return run(); }
        s.on('data', d => process.stdout.write(d.toString()));
        s.stderr.on('data', d => process.stderr.write(d.toString()));
        s.on('close', run);
      });
    };
    run();
  }
}).connect({ host: process.env.DEPLOY_HOST || '82.115.50.30', username: process.env.DEPLOY_USER || 'ubuntu', password:process.env.DEPLOY_PASS, algorithms:{serverHostKey:['ssh-ed25519','ecdsa-sha2-nistp256','ssh-rsa']}, hostVerifier:()=>true });
