const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const localFile = path.join(__dirname, 'apps/web/src/components/providers/LangProvider.tsx');
    const remoteFile = '/home/ubuntu/MICROGREnUzbekistan/apps/web/src/components/providers/LangProvider.tsx';
    
    sftp.fastPut(localFile, remoteFile, (err) => {
      if (err) throw err;
      console.log('Successfully uploaded LangProvider.tsx');
      conn.end();
    });
  });
}).connect({
  host: '82.115.50.30',
  username: 'ubuntu',
  password: process.env.DEPLOY_PASS,
  algorithms: { serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'ssh-rsa'] },
  hostVerifier: () => true,
});
