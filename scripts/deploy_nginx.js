const { Client } = require('ssh2'); 
const conn = new Client(); 
conn.on('ready', () => { 
  conn.exec('cat /etc/nginx/sites-available/microgreen', (err, stream) => { 
    let data = ''; 
    stream.on('data', (d) => data += d).on('close', () => { 
      if (!data.includes('location /uploads/')) {
        const newConf = data.replace('location / {', 'location /uploads/ {\n        alias /home/ubuntu/microgreen-uploads/;\n        add_header Cache-Control "public, max-age=31536000";\n    }\n\n    location / {'); 
        conn.exec(`echo ${JSON.stringify(newConf)} | sudo tee /etc/nginx/sites-available/microgreen && sudo nginx -t && sudo systemctl reload nginx`, (err2, stream2) => { 
          stream2.on('data', d => process.stdout.write(d)).on('close', () => conn.end()); 
        }); 
      } else {
        console.log('Already configured');
        conn.end();
      }
    }); 
  }); 
}).connect({host: '82.115.50.30', username: 'ubuntu', password: process.env.DEPLOY_PASS});
