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
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    visitId INTEGER,
    FOREIGN KEY(visitId) REFERENCES visits(id)
  );
`);

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
    try {
        const stmt = db.prepare('INSERT INTO visits (ip, userAgent) VALUES (?, ?)');
        const info = stmt.run(req.ip, req.get('User-Agent'));
        res.json({ success: true, visitId: info.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/track/ping', (req, res) => {
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
    try {
        const { linkUrl, visitId } = req.body;
        const stmt = db.prepare('INSERT INTO clicks (linkUrl, visitId) VALUES (?, ?)');
        stmt.run(linkUrl, visitId || null);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// Preview Route for Admin
app.get('/preview', (req, res) => {
    if (!req.session.loggedIn) return res.status(403).send('Unauthorized');
    const data = req.session.draft || getData();
    res.render('index', data);
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

    const topLinks = db.prepare(`
        SELECT linkUrl, COUNT(*) as count 
        FROM clicks 
        GROUP BY linkUrl 
        ORDER BY count DESC 
        LIMIT 10
    `).all();

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

app.listen(PORT, '0.0.0.0', () => {
    console.log('Server started on port ' + PORT);
});
