// server-cached.js — Standalone server with forced cache headers
// Wraps res.writeHead to OVERRIDE cache headers AFTER Next.js sets them
// This is the only reliable way to control caching in standalone mode

const http = require('http');
const original = http.createServer;

const YEAR = 'public, max-age=31536000, immutable';
const DAY = 'public, max-age=86400, stale-while-revalidate=604800';

http.createServer = function (handler, ...rest) {
    const wrapped = (req, res) => {
        const u = req.url || '';
        let cacheValue = null;

        // Determine cache value based on URL
        if (u.startsWith('/_next/static/')) cacheValue = YEAR;
        else if (u.startsWith('/images/')) cacheValue = YEAR;
        else if (/\.(png|jpe?g|webp|avif|svg|ico|gif)(\?|$)/i.test(u)) cacheValue = YEAR;
        else if (/\.(woff2?|ttf|otf|eot)(\?|$)/i.test(u)) cacheValue = YEAR;
        else if (u.startsWith('/api/')) cacheValue = 'no-store';
        else if (/\/(manifest\.json|sw\.js)/.test(u)) cacheValue = DAY;

        if (cacheValue) {
            // Override writeHead to force our cache header AFTER Next.js sets its own
            const origWriteHead = res.writeHead;
            res.writeHead = function (statusCode, ...args) {
                // Force our Cache-Control regardless of what Next.js set
                res.setHeader('Cache-Control', cacheValue);
                return origWriteHead.call(this, statusCode, ...args);
            };
        }

        // Security headers (these don't conflict)
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');

        handler(req, res);
    };
    return original.call(this, wrapped, ...rest);
};

// Load the standalone server — uses our patched createServer
require('./server.js');
