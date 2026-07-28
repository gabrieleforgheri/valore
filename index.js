const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const Database = require('better-sqlite3');

const db = new Database('stats.db');
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
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'valore123'; // Default password

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'super-secret-valore-key',
    resave: false,
    saveUninitialized: true
}));

const dataFile = path.join(__dirname, 'data.json');

function getData() {
    let data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
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
    if (!data.socials) {
        data.socials = [
            { id: "1", platform: "youtube", url: "https://www.youtube.com/@rarestValore" },
            { id: "2", platform: "tiktok", url: "https://tiktok.com/@rarestvalore" },
            { id: "3", platform: "spotify", url: "https://open.spotify.com/intl-it/artist/3vO9rAZ7FTlGRwMKXtAerh?si=7Fsg43CTSrmze-xSQ5jTag" }
        ];
    }
    return data;
}

function saveData(data) {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

// Public Route
app.get('/', (req, res) => {
    const data = getData();
    res.render('index', data);
});

// Analytics Endpoints
app.post('/api/track/visit', (req, res) => {
    if (req.session && req.session.loggedIn) return res.json({ success: true, visitId: null });
    try {
        const stmt = db.prepare('INSERT INTO visits (ip, userAgent) VALUES (?, ?)');
        const info = stmt.run(req.ip, req.get('User-Agent'));
        res.json({ success: true, visitId: info.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/track/ping', (req, res) => {
    if (req.session && req.session.loggedIn) return res.json({ success: true });
    try {
        const { visitId, timeSpent } = req.body;
        if (visitId) {
            const stmt = db.prepare('UPDATE visits SET timeSpent = ? WHERE id = ?');
            stmt.run(timeSpent, visitId);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/track/click', (req, res) => {
    if (req.session && req.session.loggedIn) return res.json({ success: true });
    try {
        const { linkUrl, linkTitle, visitId } = req.body;
        const stmt = db.prepare('INSERT INTO clicks (linkUrl, linkTitle, visitId) VALUES (?, ?, ?)');
        stmt.run(linkUrl, linkTitle || null, visitId || null);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// Preview Route for Admin
app.get('/preview', (req, res) => {
    if (!req.session.loggedIn) return res.status(403).send('Unauthorized');
    const data = req.session.draft || getData();
    res.render('index', { ...data, isPreview: true });
});

app.post('/admin/preview', (req, res) => {
    if (!req.session.loggedIn) return res.status(403).send('Unauthorized');
    req.session.draft = req.body;
    res.json({ success: true });
});

// Admin Login
app.get('/admin', (req, res) => {
    if (req.session.loggedIn) return res.redirect('/admin/dashboard');
    res.render('login');
});

app.post('/admin/login', (req, res) => {
    if (req.body.password === ADMIN_PASSWORD) {
        req.session.loggedIn = true;
        res.redirect('/admin/dashboard');
    } else {
        res.send('Password errata. <a href="/admin">Riprova</a>');
    }
});

// Admin Dashboard
app.get('/admin/dashboard', (req, res) => {
    if (!req.session.loggedIn) return res.redirect('/admin');
    
    const totalVisits = db.prepare('SELECT COUNT(*) as count FROM visits').get().count;
    const totalClicks = db.prepare('SELECT COUNT(*) as count FROM clicks').get().count;

    const currentData = getData();
    
    // Social Clicks calculation
    const socialClicksMap = {};
    if (currentData.socials && Array.isArray(currentData.socials)) {
        currentData.socials.forEach(s => {
            const platName = (s.platform || 'social').toUpperCase();
            socialClicksMap[s.id] = {
                id: s.id,
                platform: s.platform,
                name: platName,
                count: 0
            };
        });
    }

    // LinkBox Clicks calculation
    const linkClicksMap = {};
    if (currentData.links && Array.isArray(currentData.links)) {
        currentData.links.forEach(l => {
            linkClicksMap[l.id] = {
                id: l.id,
                title: l.title || 'Link',
                count: 0
            };
        });
    }

    // Query all click totals
    const clickCountsRaw = db.prepare(`
        SELECT linkTitle, linkUrl, COUNT(*) as count 
        FROM clicks 
        GROUP BY linkTitle, linkUrl
    `).all();

    clickCountsRaw.forEach(row => {
        const rawTitle = (row.linkTitle || '').trim();
        const rawUrl = (row.linkUrl || '').trim().replace(/\/$/, '');

        if (currentData.socials) {
            currentData.socials.forEach(s => {
                const sUrl = (s.url || '').trim().replace(/\/$/, '');
                const platMatch = `Social: ${s.platform.toUpperCase()}`;
                if ((sUrl && rawUrl && sUrl.toLowerCase() === rawUrl.toLowerCase()) || rawTitle.toUpperCase() === platMatch.toUpperCase()) {
                    if (socialClicksMap[s.id]) socialClicksMap[s.id].count += row.count;
                }
            });
        }

        if (currentData.links) {
            currentData.links.forEach(l => {
                const lUrl = (l.url || '').trim().replace(/\/$/, '');
                if ((lUrl && rawUrl && lUrl.toLowerCase() === rawUrl.toLowerCase()) || (l.title && rawTitle.toLowerCase() === l.title.toLowerCase())) {
                    if (linkClicksMap[l.id]) linkClicksMap[l.id].count += row.count;
                }
            });
        }
    });

    const socialClicks = Object.values(socialClicksMap);
    const linkClicks = Object.values(linkClicksMap);

    const stats = { totalVisits, totalClicks, socialClicks, linkClicks };
    
    res.render('admin', { data: currentData, stats });
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

app.post('/admin/update', (req, res) => {
    if (!req.session.loggedIn) return res.redirect('/admin');
    saveData(req.body);
    req.session.draft = null; // clear draft on save
    res.json({ success: true });
});

// Upload image endpoint
app.post('/admin/upload-image', (req, res) => {
    if (!req.session.loggedIn) return res.status(403).json({ success: false, error: 'Unauthorized' });
    try {
        const { filename, base64 } = req.body;
        if (!base64) return res.status(400).json({ success: false, error: 'No image data provided' });
        
        const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const cleanName = (filename || 'image.png').replace(/[^a-zA-Z0-9.-]/g, '_');
        const newFileName = `upload_${Date.now()}_${cleanName}`;
        const targetPath = path.join(__dirname, 'public', 'images', newFileName);
        
        fs.writeFileSync(targetPath, buffer);
        res.json({ success: true, url: `images/${newFileName}` });
    } catch (err) {
        console.error('Image upload error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Fetch URL metadata endpoint (for automatic social handle / profile name detection)
app.post('/admin/fetch-url-meta', async (req, res) => {
    if (!req.session.loggedIn) return res.status(403).json({ success: false, error: 'Unauthorized' });
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ success: false, error: 'No URL provided' });
        
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
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            if (fetchRes.ok) {
                const html = await fetchRes.text();
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
