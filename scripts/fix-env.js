const { Client } = require('ssh2');

const conn = new Client();

conn.on('ready', () => {
  const cmd = `echo "TELEGRAM_BOT_TOKEN=8039142477:AAEF1F4CCmy-uJh9RNYiMTBTT9vn3TW0F88" >> /home/ubuntu/MICROGREnUzbekistan/.env && pm2 restart microgreen-web --update-env`;
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
  host: '82.115.50.30',
  username: 'ubuntu',
  password: process.env.DEPLOY_PASS,
  algorithms: { serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'ssh-rsa'] }
});
