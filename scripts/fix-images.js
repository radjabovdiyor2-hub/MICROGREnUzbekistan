const { Client } = require('ssh2');

const conn = new Client();

conn.on('ready', () => {
  const cmd = `psql postgresql://microgreen:microgreen123@localhost:5432/microgreen -c "UPDATE products SET images = ARRAY['https://cdn.pixabay.com/photo/2018/10/05/22/02/arugula-3727003_1280.jpg'] WHERE name_uz ILIKE '%rukkola%' OR name_ru ILIKE '%руккола%';"`;
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('data', (d) => process.stdout.write(d.toString()));
    stream.stderr.on('data', (d) => process.stderr.write(d.toString()));
    stream.on('close', () => {
      console.log('Done!');
      conn.end();
    });
  });
}).connect({
  host: '82.115.50.30',
  username: 'ubuntu',
  password: process.env.DEPLOY_PASS,
  algorithms: { serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'ssh-rsa'] }
});
