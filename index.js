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
    
    const dailyVisits = db.prepare(`
        SELECT date(timestamp) as date, COUNT(*) as count 
        FROM visits 
        WHERE timestamp > datetime('now', '-7 days') 
        GROUP BY date(timestamp) 
        ORDER BY date ASC
    `).all();

    const topLinksRaw = db.prepare(`
        SELECT linkUrl, MAX(linkTitle) as linkTitle, COUNT(*) as count 
        FROM clicks 
        GROUP BY linkUrl 
        ORDER BY count DESC 
        LIMIT 10
    `).all();

    const currentData = getData();
    const urlToTitleMap = {};
    const cleanUrl = (u) => u ? u.trim().replace(/\/$/, '') : '';
    if (currentData.links) {
        currentData.links.forEach(l => {
            if (l.url) urlToTitleMap[cleanUrl(l.url)] = l.title;
        });
    }
    if (currentData.socials) {
        currentData.socials.forEach(s => {
            if (s.url) urlToTitleMap[cleanUrl(s.url)] = `Social: ${s.platform.toUpperCase()}`;
        });
    }

    const topLinks = topLinksRaw.map(row => {
        let title = row.linkTitle || urlToTitleMap[cleanUrl(row.linkUrl)] || row.linkUrl;
        return {
            title: title,
            url: row.linkUrl,
            linkUrl: row.linkUrl,
            count: row.count
        };
    });

    const stats = { totalVisits, totalClicks, dailyVisits, topLinks };
    
    res.render('admin', { data: getData(), stats });
});

// Update links
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

app.listen(PORT, '0.0.0.0', () => {
    console.log('Server started on port ' + PORT);
});
