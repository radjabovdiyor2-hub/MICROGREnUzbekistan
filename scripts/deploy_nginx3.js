const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  conn.exec('cat /etc/nginx/sites-available/microgreen', (err, stream) => {
    let data = '';
    stream.on('data', (d) => data += d).on('close', () => {
      // Fix the corrupted file
      let fixed = data;
      // If it has literal \n
      if (fixed.includes('\\n')) {
          fixed = fixed.replace(/\\n/g, '\n');
      }
      // If it starts and ends with quotes
      if (fixed.startsWith('"') && fixed.endsWith('"')) {
          fixed = fixed.slice(1, -1);
      }
      
      const fs = require('fs');
      fs.writeFileSync('nginx_fixed.tmp', fixed);

      conn.sftp((err, sftp) => {
        sftp.fastPut('nginx_fixed.tmp', '/home/ubuntu/nginx_fixed.tmp', (err) => {
          if (err) throw err;
          conn.exec('sudo mv /home/ubuntu/nginx_fixed.tmp /etc/nginx/sites-available/microgreen && sudo nginx -t && sudo systemctl reload nginx', (err, stream2) => {
            stream2.on('data', d => process.stdout.write(d)).on('close', () => conn.end());
          });
        });
      });
    });
  });
}).connect({host: process.env.DEPLOY_HOST || '82.115.50.30', username: process.env.DEPLOY_USER || 'ubuntu', password: process.env.DEPLOY_PASS});
