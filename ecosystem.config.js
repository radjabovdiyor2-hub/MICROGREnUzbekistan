const path = require('path');
const fs = require('fs');

// Load .env from project root
const ROOT = __dirname;
const envPath = path.join(ROOT, '.env');
const envVars = {};

if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
            const key = trimmed.substring(0, eqIdx);
            const value = trimmed.substring(eqIdx + 1);
            envVars[key] = value;
        }
    }
}

module.exports = {
    apps: [
        {
            name: "microgreen-web",
            script: "./apps/web/.next/standalone/apps/web/server.js",
            env: {
                ...envVars,
                NODE_ENV: "production",
                PORT: 3002,
                HOSTNAME: "0.0.0.0",
                NODE_OPTIONS: "--max-old-space-size=768",
                TELEGRAM_BOT_TOKEN: "8039142477:AAEF1F4CCmy-uJh9RNYiMTBTT9vn3TW0F88",
                ADMIN_CHAT_ID: "847872669"
            },
            max_memory_restart: "600M",
            instances: 1,
            autorestart: true,
            watch: false,
            error_file: "./logs/web-error.log",
            out_file: "./logs/web-out.log",
            merge_logs: true,
            log_date_format: "YYYY-MM-DD HH:mm:ss"
        },
        {
            name: "microgreen-bot",
            cwd: "./apps/bot",
            script: "start.sh",
            interpreter: "/bin/bash",
            env: {
                PYTHONUNBUFFERED: "1"
            },
            max_memory_restart: "200M",
            autorestart: true,
            watch: false,
            error_file: "./logs/bot-error.log",
            out_file: "./logs/bot-out.log",
            merge_logs: true,
            log_date_format: "YYYY-MM-DD HH:mm:ss"
        }
    ]
};
