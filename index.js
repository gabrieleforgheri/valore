const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');

const app = express();
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'valore123'; // Default password

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'super-secret-valore-key',
    resave: false,
    saveUninitialized: false
}));

const dataFile = path.join(__dirname, 'data.json');

function getData() {
    return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

function saveData(data) {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

// Public Route
app.get('/', (req, res) => {
    const data = getData();
    res.render('index', data);
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
    const { links, profile } = req.body;
    let data = getData();
    if(profile) data.profile = profile;
    if(links) data.links = links;
    saveData(data);
    res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log('Server started');
});
