const express = require('express');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Настройка порта для Render
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());
app.use(session({
    secret: 'cats-hockey-final-2026',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 86400000 }
}));

const DB_FILE = './database.json';
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: {} }, null, 4));

// --- API ---
app.post('/api/register', (req, res) => {
    const { login, pass } = req.body;
    const db = JSON.parse(fs.readFileSync(DB_FILE));
    if (db.users[login]) return res.json({ ok: false, msg: 'Имя занято' });
    db.users[login] = { login, pass, elo: 200, hero: 'korzhik', wins: 0, loses: 0 };
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 4));
    req.session.userId = login;
    res.json({ ok: true });
});

app.post('/api/login', (req, res) => {
    const { login, pass } = req.body;
    const db = JSON.parse(fs.readFileSync(DB_FILE));
    if (!db.users[login] || db.users[login].pass !== pass) return res.json({ ok: false, msg: 'Ошибка входа' });
    req.session.userId = login;
    res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
    if (req.session.userId) {
        const db = JSON.parse(fs.readFileSync(DB_FILE));
        res.json({ ok: true, user: db.users[req.session.userId] });
    } else res.json({ ok: false });
});

app.post('/api/save', (req, res) => {
    if (!req.session.userId) return res.status(403).send();
    const { elo, hero, win } = req.body;
    const db = JSON.parse(fs.readFileSync(DB_FILE));
    const u = db.users[req.session.userId];
    u.elo = elo; u.hero = hero;
    if (win) u.wins++; else u.loses++;
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 4));
    res.json({ ok: true });
});

// --- Online Matchmaking ---
let waitingPlayer = null;
io.on('connection', (socket) => {
    socket.on('findGame', (data) => {
        if (waitingPlayer && waitingPlayer.id !== socket.id) {
            const roomId = `room_${waitingPlayer.id}_${socket.id}`;
            const p1 = waitingPlayer;
            const p2 = { id: socket.id, ...data };
            waitingPlayer = null;
            io.to(p1.id).emit('matchFound', { roomId, role: 'p1', enemy: p2 });
            io.to(p2.id).emit('matchFound', { roomId, role: 'p2', enemy: p1 });
        } else {
            waitingPlayer = { id: socket.id, ...data };
        }
    });
    socket.on('move', (d) => socket.broadcast.emit('enemyMove', d));
    socket.on('puckSync', (d) => socket.broadcast.emit('puckUpdate', d));
    socket.on('goalSync', (d) => socket.broadcast.emit('goalUpdate', d));
});

server.listen(PORT, () => console.log(`Server started on port ${PORT}`));
