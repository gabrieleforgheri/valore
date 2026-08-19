const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const session = require('express-session');
const Database = require('better-sqlite3');

// Always resolve against the app directory: the process may be started from
// anywhere (Pelican starts it from /home/container), and a relative path would
// silently create a second, empty database next to the working directory.
const db = new Database(path.join(__dirname, 'stats.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT,
    userAgent TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    timeSpent INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    linkUrl TEXT,
    linkTitle TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    visitId INTEGER,
    FOREIGN KEY(visitId) REFERENCES visits(id)
  );
`);

try {
    db.exec('ALTER TABLE clicks ADD COLUMN linkTitle TEXT;');
} catch (e) {
    // Column already exists
}

const app = express();
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;

// --- Admin password -------------------------------------------------------
// Order: ADMIN_PASSWORD env > secrets/admin-password.txt > a fresh random one.
// There is deliberately no hardcoded fallback: this repository is public, so a
// default password in the source is the same as no password at all.
const SECRETS_DIR = path.join(__dirname, 'secrets');
function readOrCreateSecret(fileName, label) {
    const file = path.join(SECRETS_DIR, fileName);
    try {
        const existing = fs.readFileSync(file, 'utf8').trim();
        if (existing) return existing;
    } catch (e) {
        // not created yet
    }
    const generated = crypto.randomBytes(18).toString('base64url');
    fs.mkdirSync(SECRETS_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, generated + '\n', { mode: 0o600 });
    console.log(`[valore] generated a new ${label} in secrets/${fileName}`);
    return generated;
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || readOrCreateSecret('admin-password.txt', 'admin password');
const SESSION_SECRET = process.env.SESSION_SECRET || readOrCreateSecret('session-secret.txt', 'session secret');

// Behind Nginx Proxy Manager / Cloudflare every request arrives from the proxy,
// so without this req.ip is the proxy's address on every single visit.
const TRUST_PROXY = process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal';
app.set('trust proxy', TRUST_PROXY === 'false' ? false : TRUST_PROXY);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    name: 'valore.sid',
    secret: SESSION_SECRET,
    resave: false,
    // Only hand out a cookie once there is something to remember; otherwise
    // every anonymous visitor gets a session stored in memory forever.
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.SECURE_COOKIES === '1',
        maxAge: 1000 * 60 * 60 * 12
    }
}));

const dataFile = path.join(__dirname, 'data.json');
const dataSeedFile = path.join(__dirname, 'data.default.json');

// data.json holds the live page content and is intentionally NOT tracked in
// git: it belongs to the running instance, not to the repository. A checkout
// that has never been configured is seeded from data.default.json.
if (!fs.existsSync(dataFile) && fs.existsSync(dataSeedFile)) {
    fs.copyFileSync(dataSeedFile, dataFile);
    console.log('[valore] data.json created from data.default.json');
}

function getData() {
    let data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    if (!data.profile) data.profile = { name: 'Valore' };
    if (!data.seo || typeof data.seo !== 'object') data.seo = {};
    // The templates iterate over both of these unconditionally.
    if (!Array.isArray(data.links)) data.links = [];
    if (!Array.isArray(data.socials)) data.socials = [];
    if (!data.theme) {
        data.theme = {
            bgType: 'gradient',
            gradientDirection: 'to bottom',
            bgColor1: '#0B152C',
            bgColor2: '#4E769B',
            bgGlow: 'rgba(234,115,230,0.80)',
            bgGlowEnd: 'rgba(234,115,230,0.00)',
            fontColor: '#fce7ff',
            btnBg: 'transparent',
            btnText: '#fce7ff',
            btnRadius: '0',
            fontFamily: 'IBM Plex Sans'
        };
    }
    // A social row saved without a platform used to crash both the template and
    // the dashboard on `.toUpperCase()` of undefined.
    data.socials.forEach(s => { if (!s.platform) s.platform = 'link'; });
    return data;
}

// Write through a temporary file: a crash halfway through writeFileSync used to
// be able to leave data.json truncated, which takes the whole page down.
function saveData(data) {
    const tmp = dataFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, dataFile);
}

// The dashboard POSTs whatever its Vue model happens to hold; only the four
// known top-level keys are ever persisted, so a malformed or hostile payload
// cannot add arbitrary content to the file that renders the public page.
function sanitizeData(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const out = {};
    ['profile', 'theme', 'seo'].forEach(key => {
        if (body[key] && typeof body[key] === 'object' && !Array.isArray(body[key])) out[key] = body[key];
    });
    ['links', 'socials'].forEach(key => {
        if (Array.isArray(body[key])) out[key] = body[key].filter(e => e && typeof e === 'object');
    });
    if (!out.profile) return null;
    return out;
}

// Absolute base URL, used for canonical / Open Graph tags. Set PUBLIC_URL when
// the page is served behind a proxy under a different hostname than it sees.
function baseUrl(req) {
    const configured = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
    if (configured) return configured;
    return `${req.protocol}://${req.get('host')}`;
}

// Public Route
app.get('/', (req, res) => {
    res.render('index', { ...getData(), siteUrl: baseUrl(req) });
});

// Analytics Endpoints
// The `ip` column stores a daily-salted hash, never the address itself: nothing
// in the application ever reads it back, so keeping the raw IP would be storing
// personal data for no purpose at all.
const IP_SALT = crypto.randomBytes(16).toString('hex');
function visitorHash(req) {
    const day = new Date().toISOString().slice(0, 10);
    return crypto.createHash('sha256')
        .update(IP_SALT + day + (req.ip || '') + (req.get('User-Agent') || ''))
        .digest('hex')
        .slice(0, 32);
}

const BOT_UA = /bot|crawl|spider|slurp|curl|wget|headless|preview|monitor|uptime|facebookexternalhit|whatsapp|telegram/i;
function isBot(req) {
    return BOT_UA.test(req.get('User-Agent') || '');
}

function clip(value, max) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, max) : null;
}

app.post('/api/track/visit', (req, res) => {
    try {
        if (isBot(req)) return res.json({ success: true, visitId: null });
        const stmt = db.prepare('INSERT INTO visits (ip, userAgent) VALUES (?, ?)');
        const info = stmt.run(visitorHash(req), clip(req.get('User-Agent'), 255));
        res.json({ success: true, visitId: info.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/track/ping', (req, res) => {
    try {
        const visitId = Number(req.body && req.body.visitId);
        let timeSpent = Number(req.body && req.body.timeSpent);
        if (!Number.isInteger(visitId) || visitId <= 0) return res.json({ success: true });
        if (!Number.isFinite(timeSpent)) return res.json({ success: true });
        // A tab left open for a week is not "time on page"; cap at 6 hours.
        timeSpent = Math.min(Math.max(Math.floor(timeSpent), 0), 6 * 3600);
        db.prepare('UPDATE visits SET timeSpent = ? WHERE id = ? AND ? > timeSpent').run(timeSpent, visitId, timeSpent);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/track/click', (req, res) => {
    try {
        if (isBot(req)) return res.json({ success: true });
        const linkUrl = clip(req.body && req.body.linkUrl, 2048);
        if (!linkUrl) return res.status(400).json({ success: false });
        const linkTitle = clip(req.body && req.body.linkTitle, 255);
        const visitId = Number(req.body && req.body.visitId);
        const stmt = db.prepare('INSERT INTO clicks (linkUrl, linkTitle, visitId) VALUES (?, ?, ?)');
        stmt.run(linkUrl, linkTitle, Number.isInteger(visitId) && visitId > 0 ? visitId : null);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// Preview Route for Admin
app.get('/preview', (req, res) => {
    if (!req.session.loggedIn) return res.status(403).send('Unauthorized');
    const draft = req.session.draft ? sanitizeData(req.session.draft) : null;
    const data = draft ? { ...getData(), ...draft } : getData();
    res.render('index', { ...data, siteUrl: baseUrl(req), isPreview: true });
});

app.post('/admin/preview', (req, res) => {
    if (!req.session.loggedIn) return res.status(403).send('Unauthorized');
    req.session.draft = req.body;
    res.json({ success: true });
});

// Admin Login
app.get('/admin', (req, res) => {
    if (req.session.loggedIn) return res.redirect('/admin/dashboard');
    res.render("login", { ...getData(), error: req.query.error || null });
});

// Simple in-memory throttle: five wrong passwords from one address and that
// address waits. Enough to make the login form useless to a script.
const loginAttempts = new Map();
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 10 * 60 * 1000;

function safeEquals(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

app.post('/admin/login', (req, res) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const record = loginAttempts.get(key);

    if (record && record.count >= LOGIN_MAX_ATTEMPTS && now - record.last < LOGIN_LOCKOUT_MS) {
        return res.status(429).redirect('/admin?error=locked');
    }

    if (safeEquals(req.body.password || '', ADMIN_PASSWORD)) {
        loginAttempts.delete(key);
        // Stop a pre-login session id from being reused after authentication.
        req.session.regenerate(err => {
            if (err) return res.redirect('/admin?error=1');
            req.session.loggedIn = true;
            res.redirect('/admin/dashboard');
        });
        return;
    }

    loginAttempts.set(key, {
        count: record && now - record.last < LOGIN_LOCKOUT_MS ? record.count + 1 : 1,
        last: now
    });
    res.redirect('/admin?error=1');
});

app.post('/admin/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/admin'));
});

// Click rows are matched back to the configured links and socials by URL or by
// the title recorded at click time. Both the dashboard render and the polling
// endpoint need exactly this, so it lives in one place.
function computeStats() {
    const totalVisits = db.prepare('SELECT COUNT(*) as count FROM visits').get().count;
    const totalClicks = db.prepare('SELECT COUNT(*) as count FROM clicks').get().count;
    const currentData = getData();

    const socialClicksMap = {};
    currentData.socials.forEach(s => {
        socialClicksMap[s.id] = { id: s.id, platform: s.platform, name: (s.platform || 'social').toUpperCase(), count: 0 };
    });

    const linkClicksMap = {};
    currentData.links.forEach(l => {
        linkClicksMap[l.id] = { id: l.id, title: l.title || 'Link', count: 0 };
    });

    const normalise = v => (v || '').trim().replace(/\/$/, '').toLowerCase();

    db.prepare('SELECT linkTitle, linkUrl, COUNT(*) as count FROM clicks GROUP BY linkTitle, linkUrl').all().forEach(row => {
        const rawTitle = (row.linkTitle || '').trim();
        const rawUrl = normalise(row.linkUrl);

        currentData.socials.forEach(s => {
            const sUrl = normalise(s.url);
            const platMatch = `Social: ${(s.platform || '').toUpperCase()}`;
            if ((sUrl && rawUrl && sUrl === rawUrl) || rawTitle.toUpperCase() === platMatch.toUpperCase()) {
                if (socialClicksMap[s.id]) socialClicksMap[s.id].count += row.count;
            }
        });

        currentData.links.forEach(l => {
            const lUrl = normalise(l.url);
            if ((lUrl && rawUrl && lUrl === rawUrl) || (l.title && rawTitle.toLowerCase() === l.title.toLowerCase())) {
                if (linkClicksMap[l.id]) linkClicksMap[l.id].count += row.count;
            }
        });
    });

    return {
        data: currentData,
        totalVisits,
        totalClicks,
        socialClicks: Object.values(socialClicksMap),
        linkClicks: Object.values(linkClicksMap)
    };
}

// Admin Dashboard
app.get('/admin/dashboard', (req, res) => {
    if (!req.session.loggedIn) return res.redirect('/admin');
    const { data, totalVisits, totalClicks, socialClicks, linkClicks } = computeStats();
    res.render('admin', { data, stats: { totalVisits, totalClicks, socialClicks, linkClicks } });
});

// Analytics Chart & Export API
app.get('/admin/api/analytics', (req, res) => {
    if (!req.session || !req.session.loggedIn) return res.status(403).json({ error: 'Unauthorized' });

    let startDate = req.query.startDate;
    let endDate = req.query.endDate;

    const today = new Date();
    if (!endDate) {
        endDate = today.toISOString().split('T')[0];
    }
    if (!startDate) {
        const start = new Date();
        start.setDate(today.getDate() - 14);
        startDate = start.toISOString().split('T')[0];
    }

    // Limit max date range to 31 days
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    const diffDays = Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24));
    if (diffDays > 31) {
        const maxStart = new Date(endMs - 30 * 24 * 60 * 60 * 1000);
        startDate = maxStart.toISOString().split('T')[0];
    }

    const dailyClicks = db.prepare(`
        SELECT date(timestamp) as date, COUNT(*) as count 
        FROM clicks 
        WHERE date(timestamp) >= ? AND date(timestamp) <= ?
        GROUP BY date(timestamp)
        ORDER BY date ASC
    `).all(startDate, endDate);

    const detailedClicks = db.prepare(`
        SELECT date(timestamp) as date, linkTitle, linkUrl, COUNT(*) as count 
        FROM clicks 
        WHERE date(timestamp) >= ? AND date(timestamp) <= ?
        GROUP BY date(timestamp), linkTitle, linkUrl
        ORDER BY date ASC
    `).all(startDate, endDate);

    res.json({ success: true, startDate, endDate, dailyClicks, detailedClicks });
});

// Live Stats API (for real-time polling)
app.get('/admin/api/stats', (req, res) => {
    if (!req.session || !req.session.loggedIn) return res.status(403).json({ error: 'Unauthorized' });
    const { totalVisits, totalClicks, socialClicks, linkClicks } = computeStats();
    res.json({ success: true, totalVisits, totalClicks, socialClicks, linkClicks });
});

function persist(req, res) {
    if (!req.session.loggedIn) return res.status(403).json({ success: false, error: 'Unauthorized' });
    const clean = sanitizeData(req.body);
    if (!clean) return res.status(400).json({ success: false, error: 'Invalid payload' });
    // Merge rather than replace: the dashboard only ever posts profile, links,
    // socials and theme, so a plain overwrite silently dropped everything else
    // in the file (the `seo` block, for one).
    saveData({ ...getData(), ...clean });
    req.session.draft = null;
    res.json({ success: true });
}

app.post('/admin/save', persist);
app.post('/admin/update', persist);

// Upload image endpoint
app.post('/admin/upload-image', (req, res) => {
    if (!req.session.loggedIn) return res.status(403).json({ success: false, error: 'Unauthorized' });
    try {
        const { filename, base64 } = req.body;
        if (!base64) return res.status(400).json({ success: false, error: 'No image data provided' });

        // The extension decides what the static middleware will serve this file
        // as, so it comes from the declared image type — never from the client's
        // filename, which could otherwise drop an .html or .js into public/.
        const typeMatch = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml)?;base64,/.exec(base64);
        if (!typeMatch) return res.status(400).json({ success: false, error: 'Not an image' });
        const EXT = { png: 'png', jpeg: 'jpg', jpg: 'jpg', gif: 'gif', webp: 'webp', 'svg+xml': 'svg' };
        const ext = EXT[typeMatch[1]] || 'png';

        const base64Data = base64.slice(typeMatch[0].length);
        const buffer = Buffer.from(base64Data, 'base64');
        if (!buffer.length) return res.status(400).json({ success: false, error: 'Empty image' });
        if (buffer.length > 8 * 1024 * 1024) return res.status(413).json({ success: false, error: 'Image too large (max 8 MB)' });

        const stem = path.parse(filename || 'image').name.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 40) || 'image';
        const newFileName = `upload_${Date.now()}_${stem}.${ext}`;
        const targetPath = path.join(__dirname, 'public', 'images', newFileName);

        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, buffer);
        res.json({ success: true, url: `images/${newFileName}` });
    } catch (err) {
        console.error('Image upload error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// This endpoint makes the server fetch a URL the browser supplies. Without a
// guard it is a probe into the LAN the container sits on, so the obvious
// internal targets are refused before anything is requested.
const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?|\[?f[cd])/i;
function isPublicHttpUrl(raw) {
    let parsed;
    try {
        parsed = new URL(raw);
    } catch (e) {
        return false;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return !PRIVATE_HOST.test(parsed.hostname);
}

// Fetch URL metadata endpoint (for automatic social handle / profile name detection)
app.post('/admin/fetch-url-meta', async (req, res) => {
    if (!req.session.loggedIn) return res.status(403).json({ success: false, error: 'Unauthorized' });
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ success: false, error: 'No URL provided' });
        if (!isPublicHttpUrl(url)) return res.status(400).json({ success: false, error: 'Only public http(s) URLs are allowed' });

        let username = null;
        let title = null;
        
        // 1. Check direct URL pattern regexes
        const igMatch = url.match(/instagram\.com\/([^/?#]+)/i);
        if (igMatch && igMatch[1] && !['www', 'p', 'reel', 'reels', 'explore', 'stories'].includes(igMatch[1].toLowerCase())) {
            username = '@' + igMatch[1];
        }
        
        const tkMatch = url.match(/tiktok\.com\/@?([^/?#]+)/i);
        if (!username && tkMatch && tkMatch[1] && !['video', 'foryou', 'explore', 'live'].includes(tkMatch[1].toLowerCase())) {
            username = '@' + tkMatch[1].replace(/^@/, '');
        }
        
        const ytMatch = url.match(/youtube\.com\/@([^/?#]+)/i);
        if (!username && ytMatch && ytMatch[1]) {
            username = '@' + ytMatch[1];
        }
        
        const xMatch = url.match(/(?:twitter|x)\.com\/([^/?#]+)/i);
        if (!username && xMatch && xMatch[1] && !['home', 'explore', 'search', 'messages', 'notifications'].includes(xMatch[1].toLowerCase())) {
            username = '@' + xMatch[1];
        }

        // 2. If no direct username or if we want webpage title, fetch HTML
        try {
            const fetchRes = await fetch(url, {
                redirect: 'follow',
                signal: AbortSignal.timeout(8000),
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            if (fetchRes.ok) {
                // Only the <head> is ever needed; some of these pages are megabytes.
                const html = (await fetchRes.text()).slice(0, 256 * 1024);
                const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
                const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
                
                if (ogTitleMatch && ogTitleMatch[1]) {
                    title = ogTitleMatch[1].trim();
                } else if (titleTagMatch && titleTagMatch[1]) {
                    title = titleTagMatch[1].replace(/ - YouTube| \| LinkedIn| - TikTok| - Instagram| on Spotify/i, '').trim();
                }
                
                // If we didn't find username via URL regex, try to extract from title
                if (!username && title) {
                    const atMatch = title.match(/(@[a-zA-Z0-9_.-]+)/);
                    if (atMatch && atMatch[1]) {
                        username = atMatch[1];
                    } else if (title.includes(' - ')) {
                        username = title.split(' - ')[0].trim();
                    } else if (title.includes(' | ')) {
                        username = title.split(' | ')[0].trim();
                    } else {
                        username = title;
                    }
                }
            }
        } catch (fetchErr) {
            console.log('Could not fetch external URL HTML:', fetchErr.message);
        }
        
        res.json({ success: true, username: username || title || null, title: title || null });
    } catch (err) {
        console.error('Fetch URL meta error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log('Server started on port ' + PORT);
});
