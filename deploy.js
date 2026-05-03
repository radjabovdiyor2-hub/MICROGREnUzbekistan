/**
 * Microgreen Uzbekistan — Production Deploy
 * Server: 82.115.50.80 (microgreenuzbekistan.com)
 * Port: 3000 (isolated from other projects)
 */
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;
const SERVER = {
  host: '82.115.50.30',
  username: 'ubuntu',
  password: 'izxir(Kpaqfmsvaamtw8',
  readyTimeout: 30000,
  keepaliveInterval: 10000,
  algorithms: { serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'ssh-rsa'] },
  hostVerifier: () => true,
};
const REMOTE_ROOT = '/home/ubuntu/MICROGREnUzbekistan';

function log(msg) { console.log(`[${new Date().toLocaleTimeString()}] ${msg}`); }

// Build tar locally (exclude node_modules, .next, __pycache__)
function buildLocalTar() {
  const tarFile = path.join(ROOT, 'deploy_clean.tar.gz');
  log('Creating deploy package...');
  
  // Use PowerShell to create tar
  const cmd = `tar -czf deploy_clean.tar.gz --exclude="node_modules" --exclude=".next" --exclude="__pycache__" --exclude=".git" --exclude=".venv" --exclude="*.pyc" --exclude=".turbo" apps packages ecosystem.config.js nginx .env package.json turbo.json .gitignore README.md`;
  
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
  
  const size = (fs.statSync(tarFile).size / 1024 / 1024).toFixed(1);
  log(`Package ready: ${size} MB`);
  return tarFile;
}

// SSH execute command
function sshExec(conn, cmd) {
  return new Promise((resolve, reject) => {
    log(`> ${cmd.substring(0, 100)}${cmd.length > 100 ? '...' : ''}`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', d => { const s = d.toString(); out += s; process.stdout.write(s); });
      stream.stderr.on('data', d => process.stderr.write(d.toString()));
      stream.on('close', (code) => resolve({ code, out }));
    });
  });
}

// SFTP upload
function sftpUpload(conn, localFile, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      log(`Uploading ${path.basename(localFile)} -> ${remotePath}`);
      const rs = fs.createReadStream(localFile);
      const ws = sftp.createWriteStream(remotePath);
      rs.pipe(ws);
      ws.on('close', () => { log('Upload complete'); resolve(); });
      ws.on('error', reject);
    });
  });
}

async function main() {
  console.log('\n========================================');
  console.log(' MICROGREEN UZBEKISTAN — DEPLOY');
  console.log(' Port 3000 | No conflict with Mahallu');
  console.log('========================================\n');

  // 1. Build tar locally
  const tarFile = buildLocalTar();

  // 2. Connect to server
  const conn = new Client();
  
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve);
    conn.on('error', reject);
    log('Connecting to server...');
    conn.connect(SERVER);
  });
  log('Connected to server');

  try {
    // 3. Create remote dir and upload
    await sshExec(conn, `mkdir -p ${REMOTE_ROOT}`);
    await sftpUpload(conn, tarFile, `${REMOTE_ROOT}/deploy_clean.tar.gz`);

    // 4. Deploy on server
    const commands = [
      // Fix DNS (needed for npm/prisma)
      `echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf > /dev/null`,
      
      // Stop services gracefully
      `pm2 stop microgreen-web microgreen-bot 2>/dev/null; true`,
      
      // Extract new code
      `cd ${REMOTE_ROOT} && tar -xzf deploy_clean.tar.gz && rm deploy_clean.tar.gz`,
      
      // Install web deps
      `cd ${REMOTE_ROOT} && npm install --legacy-peer-deps 2>&1 | tail -5`,
      
      // Generate Prisma
      `cd ${REMOTE_ROOT}/packages/database && npx prisma generate 2>&1 | tail -3`,
      
      // Push DB schema
      `cd ${REMOTE_ROOT}/packages/database && npx prisma db push --skip-generate --accept-data-loss 2>&1 | tail -5`,
      
      // Build Next.js
      `cd ${REMOTE_ROOT} && npx turbo run build --filter=web 2>&1 | tail -20`,
      
      // Copy static + public into standalone
      `cd ${REMOTE_ROOT}/apps/web && cp -r public .next/standalone/apps/web/public 2>/dev/null; cp -r .next/static .next/standalone/apps/web/.next/static 2>/dev/null; true`,
      
      // Install bot deps
      `cd ${REMOTE_ROOT}/apps/bot && pip3 install -r requirements.txt -q 2>&1 | tail -3`,
      
      // Create logs dir
      `mkdir -p ${REMOTE_ROOT}/logs`,
      
      // Restart PM2
      `cd ${REMOTE_ROOT} && pm2 restart ecosystem.config.js --update-env 2>&1 || pm2 start ecosystem.config.js 2>&1`,
      `pm2 save 2>&1 | tail -1`,
      
      // Wait and verify
      `sleep 5 && pm2 status`,
      `curl -s -o /dev/null -w "Site HTTP status: %{http_code}\\n" http://localhost:3000 2>/dev/null || echo "Site not responding yet"`,
    ];

    for (const cmd of commands) {
      const result = await sshExec(conn, cmd);
      if (result.code !== 0 && !cmd.includes('true') && !cmd.includes('2>/dev/null')) {
        log(`WARNING: Command exited with code ${result.code}`);
      }
    }

    console.log('\n========================================');
    console.log(' DEPLOY COMPLETE');
    console.log(' https://microgreenuzbekistan.com');
    console.log(' Port 3000 (Microgreen)');
    console.log(' Port 3001 (Mahallu) - NOT TOUCHED');
    console.log(' Port 3002 (UzIs) - NOT TOUCHED');
    console.log('========================================\n');

  } finally {
    conn.end();
    // Cleanup local tar
    if (fs.existsSync(tarFile)) fs.unlinkSync(tarFile);
  }
}

main().catch(err => {
  console.error('Deploy failed:', err.message);
  process.exit(1);
});
