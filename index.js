const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');

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
            fontColor: '#ffffff',
            btnBg: 'transparent',
            btnText: '#fce7ff',
            btnRadius: '6px',
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
    res.render('admin', { data: getData() });
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
