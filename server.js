const express = require('express');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const DB_FILE = './database.json';

app.use(express.static('public'));
app.use(express.json());
app.use(session({
    secret: 'three-cats-hockey-secret-2026',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 86400000 }
}));

if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: {} }, null, 4));

// --- API ---
app.post('/api/register', (req, res) => {
    const { login, pass } = req.body;
    const db = JSON.parse(fs.readFileSync(DB_FILE));
    if (db.users[login]) return res.json({ ok: false, msg: 'Котик вже в грі!' });
    db.users[login] = { login, pass, elo: 200, hero: 'korzhik', wins: 0, loses: 0 };
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 4));
    req.session.userId = login;
    res.json({ ok: true });
});

app.post('/api/login', (req, res) => {
    const { login, pass } = req.body;
    const db = JSON.parse(fs.readFileSync(DB_FILE));
    if (!db.users[login] || db.users[login].pass !== pass) return res.json({ ok: false, msg: 'Помилка входу' });
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
let waitingQueue = [];

io.on('connection', (socket) => {
    socket.on('findGame', (data) => {
        if (waitingQueue.length > 0) {
            const opponent = waitingQueue.shift();
            const roomId = `room_${opponent.id}_${socket.id}`;
            
            socket.join(roomId);
            opponent.socket.join(roomId);

            io.to(opponent.id).emit('matchFound', { roomId, role: 'p1', enemy: data, side: 'left' });
            socket.emit('matchFound', { roomId, role: 'p2', enemy: opponent.data, side: 'right' });
        } else {
            waitingQueue.push({ id: socket.id, socket, data });
        }
    });

    socket.on('move', (d) => socket.to(d.roomId).emit('enemyMove', d));
    socket.on('puckSync', (d) => socket.to(d.roomId).emit('puckUpdate', d));
    socket.on('goalSync', (d) => socket.to(d.roomId).emit('goalUpdate', d));

    socket.on('disconnect', () => {
        waitingQueue = waitingQueue.filter(p => p.id !== socket.id);
    });
});

server.listen(PORT, () => console.log(`Server started on port ${PORT}`));
