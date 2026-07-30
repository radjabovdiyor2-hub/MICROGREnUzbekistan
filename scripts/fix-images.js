const { Client } = require('ssh2');

const conn = new Client();

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('DATABASE_URL не задан: DATABASE_URL=... DEPLOY_PASS=... node scripts/fix-images.js');
  process.exit(1);
}

conn.on('ready', () => {
  const cmd = `psql "${DB_URL}" -c "UPDATE products SET images = ARRAY['https://cdn.pixabay.com/photo/2018/10/05/22/02/arugula-3727003_1280.jpg'] WHERE name_uz ILIKE '%rukkola%' OR name_ru ILIKE '%руккола%';"`;
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
  host: process.env.DEPLOY_HOST || '82.115.50.30',
  username: process.env.DEPLOY_USER || 'ubuntu',
  password: process.env.DEPLOY_PASS,
  algorithms: { serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'ssh-rsa'] }
});
