/**
 * Microgreen Uzbekistan — UNIFIED production deploy (Docker Compose)
 *
 * Ships the whole monorepo (website + storefront bot + tgas AI-office) to the
 * server and brings it up with `docker compose -f docker-compose.prod.yml`.
 *
 * Secrets are NEVER hardcoded. Provide connection details via env:
 *   DEPLOY_HOST   (default: 82.115.50.30)   — confirm the real prod IP
 *   DEPLOY_USER   (default: ubuntu)
 *   DEPLOY_PASS   — SSH password  (or)
 *   DEPLOY_KEY    — path to a private key file
 *
 * Example (PowerShell):
 *   $env:DEPLOY_PASS="..."; node deploy.js
 */
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;

const HOST = process.env.DEPLOY_HOST || '82.115.50.30';
const USER = process.env.DEPLOY_USER || 'ubuntu';
const REMOTE_ROOT = process.env.DEPLOY_REMOTE_ROOT || '/home/ubuntu/MICROGREnUzbekistan';

if (!process.env.DEPLOY_PASS && !process.env.DEPLOY_KEY) {
  console.error('\nERROR: set DEPLOY_PASS (SSH password) or DEPLOY_KEY (private key path).\n');
  process.exit(1);
}

const SERVER = {
  host: HOST,
  username: USER,
  readyTimeout: 30000,
  keepaliveInterval: 10000,
  algorithms: { serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'ssh-rsa'] },
  hostVerifier: () => true,
  ...(process.env.DEPLOY_PASS ? { password: process.env.DEPLOY_PASS } : {}),
  ...(process.env.DEPLOY_KEY ? { privateKey: fs.readFileSync(process.env.DEPLOY_KEY) } : {}),
};

function log(msg) { console.log(`[${new Date().toLocaleTimeString()}] ${msg}`); }

// Build tar locally (source + env + deploy configs; exclude build/junk).
function buildLocalTar() {
  const tarFile = path.join(ROOT, 'deploy_clean.tar.gz');
  log('Creating deploy package...');
  const cmd = [
    'tar -czf deploy_clean.tar.gz',
    '--exclude="node_modules" --exclude=".next" --exclude=".turbo"',
    '--exclude="__pycache__" --exclude="*.pyc" --exclude=".git"',
    '--exclude="venv" --exclude=".venv" --exclude="dist" --exclude="build"',
    '--exclude="*.mp4" --exclude="*.ogg" --exclude="*.exe" --exclude="*.log"',
    '--exclude="bus_tasks" --exclude="backups"',
    // Ship: apps (incl. apps/tgas + its .env), packages, deploy/, nginx, root env, compose, meta
    'apps packages deploy nginx docker-compose.prod.yml .env .env.example',
    'package.json package-lock.json turbo.json .gitignore .dockerignore README.md',
  ].join(' ');
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
  const size = (fs.statSync(tarFile).size / 1024 / 1024).toFixed(1);
  log(`Package ready: ${size} MB`);
  return tarFile;
}

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
  console.log(' MICROGREEN UZBEKISTAN — UNIFIED DEPLOY');
  console.log(` Host: ${USER}@${HOST}:${REMOTE_ROOT}`);
  console.log('========================================\n');

  const tarFile = buildLocalTar();
  const conn = new Client();

  await new Promise((resolve, reject) => {
    conn.on('ready', resolve);
    conn.on('error', reject);
    log('Connecting to server...');
    conn.connect(SERVER);
  });
  log('Connected to server');

  const COMPOSE = 'docker compose -f docker-compose.prod.yml';

  try {
    await sshExec(conn, `mkdir -p ${REMOTE_ROOT}`);
    await sftpUpload(conn, tarFile, `${REMOTE_ROOT}/deploy_clean.tar.gz`);

    const commands = [
      // Extract the new release. NON-DESTRUCTIVE: the live PM2 site keeps serving.
      // Install/build/cutover is done by deploy/server-setup.sh (installs Docker
      // if missing, builds, swaps, repoints nginx) — kept out of this uploader.
      `cd ${REMOTE_ROOT} && tar -xzf deploy_clean.tar.gz && rm deploy_clean.tar.gz && chmod +x deploy/server-setup.sh 2>/dev/null; true`,
    ];

    for (const cmd of commands) {
      const result = await sshExec(conn, cmd);
      if (result.code !== 0) log(`WARNING: command exited with code ${result.code}`);
    }

    console.log('\n========================================');
    console.log(' UPLOADED to ' + REMOTE_ROOT);
    console.log(' Next, ON THE SERVER:  bash deploy/server-setup.sh');
    console.log(' (installs Docker, builds, cuts over, repoints nginx —');
    console.log('  scoped to Microgreen; mahalu/uziz/oltin-baliq untouched)');
    console.log('========================================\n');
  } finally {
    conn.end();
    if (fs.existsSync(tarFile)) fs.unlinkSync(tarFile);
  }
}

main().catch(err => {
  console.error('Deploy failed:', err.message);
  process.exit(1);
});
