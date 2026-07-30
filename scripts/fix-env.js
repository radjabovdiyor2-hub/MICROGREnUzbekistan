const { Client } = require('ssh2');

const conn = new Client();

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('BOT_TOKEN не задан: запускать так: BOT_TOKEN=... DEPLOY_PASS=... node scripts/fix-env.js');
  process.exit(1);
}

conn.on('ready', () => {
  const cmd = `echo "TELEGRAM_BOT_TOKEN=${TOKEN}" >> /home/ubuntu/MICROGREnUzbekistan/.env && pm2 restart microgreen-web --update-env`;
  console.log("Fixing remote .env and restarting web...");
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('data', (d) => process.stdout.write(d.toString()));
    stream.stderr.on('data', (d) => process.stderr.write(d.toString()));
    stream.on('close', () => {
      console.log("\nDone!");
      conn.end();
    });
  });
}).connect({
  host: process.env.DEPLOY_HOST || '82.115.50.30',
  username: process.env.DEPLOY_USER || 'ubuntu',
  password: process.env.DEPLOY_PASS,
  algorithms: { serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'ssh-rsa'] }
});
