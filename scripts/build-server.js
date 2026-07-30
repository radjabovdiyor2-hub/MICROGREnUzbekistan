const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const REMOTE = '/home/ubuntu/MICROGREnUzbekistan';
  const cmds = [
    `cd ${REMOTE} && npx turbo run build --filter=web --force 2>&1`,
    `cd ${REMOTE}/apps/web && cp -r public .next/standalone/apps/web/public 2>/dev/null; cp -r .next/static .next/standalone/apps/web/.next/static 2>/dev/null; true`,
    `pm2 restart microgreen-web --update-env 2>&1`,
    `pm2 save 2>&1`,
  ];
  let i = 0;
  const run = () => {
    if (i >= cmds.length) return conn.end();
    console.log('\n> ' + cmds[i].substring(0, 80));
    conn.exec(cmds[i++], (err, stream) => {
      if (err) { console.error(err); return run(); }
      stream.on('data', d => process.stdout.write(d.toString()));
      stream.stderr.on('data', d => process.stderr.write(d.toString()));
      stream.on('close', run);
    });
  };
  run();
}).connect({
  host: process.env.DEPLOY_HOST || '82.115.50.30',
  username: process.env.DEPLOY_USER || 'ubuntu',
  password: process.env.DEPLOY_PASS,
  algorithms: { serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'ssh-rsa'] },
  hostVerifier: () => true,
});
