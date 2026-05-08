const { Client } = require('ssh2'); 
const conn = new Client(); 
conn.on('ready', () => { 
  conn.exec('cat /etc/nginx/sites-available/microgreen', (err, stream) => { 
    let data = ''; 
    stream.on('data', (d) => data += d).on('close', () => { 
      let newConf = data.replace(/proxy_set_header Host ;/g, 'proxy_set_header Host $host;');
      newConf = newConf.replace(/proxy_set_header X-Real-IP ;/g, 'proxy_set_header X-Real-IP $remote_addr;');
      newConf = newConf.replace(/proxy_set_header X-Forwarded-For ;/g, 'proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;');
      newConf = newConf.replace(/proxy_set_header X-Forwarded-Proto ;/g, 'proxy_set_header X-Forwarded-Proto $scheme;');
      newConf = newConf.replace(/if \( = www.microgreenuzbekistan.com\)/g, 'if ($host = www.microgreenuzbekistan.com)');
      newConf = newConf.replace(/if \( = microgreenuzbekistan.com\)/g, 'if ($host = microgreenuzbekistan.com)');
      newConf = newConf.replace(/return 301 https:\/\//g, 'return 301 https://$host$request_uri');
      
      const fs = require('fs');
      fs.writeFileSync('nginx.tmp', newConf);

      conn.sftp((err, sftp) => {
        sftp.fastPut('nginx.tmp', '/home/ubuntu/nginx.tmp', (err) => {
          if (err) throw err;
          conn.exec('sudo mv /home/ubuntu/nginx.tmp /etc/nginx/sites-available/microgreen && sudo nginx -t && sudo systemctl reload nginx', (err, stream2) => {
            stream2.on('data', d => process.stdout.write(d)).on('close', () => conn.end());
          });
        });
      });
    }); 
  }); 
}).connect({host: '82.115.50.30', username: 'ubuntu', password: 'izxir(Kpaqfmsvaamtw8'});
