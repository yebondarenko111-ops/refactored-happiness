const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const STATS = {
    korzhik:   { speed: 0.18, size: 90, img: 'korzhik.png' },
    karamelka: { speed: 0.25, size: 85, img: 'karamelka.png' },
    kompot:    { speed: 0.10, size: 110, img: 'kompot.png' },
    gona:      { speed: 0.18, size: 100, img: 'gona.png' }
};

const game = {
    user: null, elo: 200, hero: 'korzhik', mode: 'bot', role: 'p1',
    p1: { x: 100, y: 250, w: 90, h: 90 },
    enemy: { x: 810, y: 250, w: 90, h: 90, hero: 'kompot' },
    puck: { x: 500, y: 300, dx: 0, dy: 0, friction: 0.985 },
    score: { p1: 0, p2: 0 }, images: {}, isGoal: false,

    async init() {
        const res = await fetch('/api/me');
        const d = await res.json();
        if(d.ok) { this.user = d.user.login; this.elo = d.user.elo; this.hero = d.user.hero; this.showLobby(); }
        this.loadMedia();
        this.setupSockets();
    },

    loadMedia() {
        ['background.jpg','puck.png','korzhik.png','karamelka.png','kompot.png','gona.png'].forEach(s => {
            this.images[s] = new Image(); this.images[s].src = `images/${s}`;
        });
    },

    setupSockets() {
        socket.on('matchFound', (d) => {
            this.role = d.role; this.enemy.hero = d.enemy.hero;
            this.startMatch('online');
        });
        socket.on('enemyMove', (d) => { this.enemy.x = d.x; this.enemy.y = d.y; });
        socket.on('puckUpdate', (d) => { if(this.role === 'p2') { this.puck.x = d.x; this.puck.y = d.y; }});
    },

    async auth(m) {
        const login = document.getElementById('u-login').value;
        const pass = document.getElementById('u-pass').value;
        const res = await fetch(`/api/${m}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({login, pass}) });
        const d = await res.json();
        if(d.ok) location.reload(); else alert(d.msg);
    },

    showLobby() {
        document.getElementById('auth-box').style.display = 'none';
        document.getElementById('lobby').style.display = 'block';
        document.getElementById('hello').innerText = `Котик: ${this.user}`;
        document.getElementById('elo-val').innerText = this.elo;
        this.setHero(this.hero);
    },

    setHero(h) {
        this.hero = h;
        document.querySelectorAll('.h-card').forEach(b => b.classList.remove('active'));
        document.getElementById('h-' + h).classList.add('active');
        this.p1.w = this.p1.h = STATS[h].size;
    },

    findOnline() {
        document.getElementById('lobby').innerHTML = "<h2>Поиск игрока...</h2>";
        socket.emit('findGame', { user: this.user, hero: this.hero });
    },

    startMatch(mode) {
        this.mode = mode;
        document.getElementById('lobby').style.display = 'none';
        document.getElementById('game-ui').style.display = 'block';
        this.initControls();
        this.loop();
    },

    initControls() {
        canvas.addEventListener('pointermove', e => {
            if(this.isGoal) return;
            const r = canvas.getBoundingClientRect();
            const tx = (e.clientX - r.left) - this.p1.w/2;
            const ty = (e.clientY - r.top) - this.p1.h/2;
            this.p1.x += (tx - this.p1.x) * STATS[this.hero].speed;
            this.p1.y += (ty - this.p1.y) * STATS[this.hero].speed;
            if(this.role === 'p1' && this.p1.x > 440) this.p1.x = 440;
            if(this.role === 'p2' && this.p1.x < 500) this.p1.x = 500;
            socket.emit('move', { x: this.p1.x, y: this.p1.y });
        });
    },

    updatePhysics() {
        this.puck.x += this.puck.dx; this.puck.y += this.puck.dy;
        this.puck.dx *= this.puck.friction; this.puck.dy *= this.puck.friction;

        if(this.puck.y < 65 || this.puck.y > 535) this.puck.dy *= -1;
        if(this.puck.x < 65) {
            if(this.puck.y > 210 && this.puck.y < 390) this.goal(false);
            else { this.puck.x = 65; this.puck.dx *= -1; }
        }
        if(this.puck.x > 935) {
            if(this.puck.y > 210 && this.puck.y < 390) this.goal(true);
            else { this.puck.x = 935; this.puck.dx *= -1; }
        }
        this.collide(this.p1); this.collide(this.enemy);
    },

    collide(obj) {
        const px = obj.x + obj.w/2, py = obj.y + obj.h/2;
        const dist = Math.hypot(px - this.puck.x, py - this.puck.y);
        const minDist = (obj.w/2 + 35);
        if(dist < minDist) {
            const angle = Math.atan2(this.puck.y - py, this.puck.x - px);
            this.puck.dx = (this.puck.x - px) * 0.22;
            this.puck.dy = (this.puck.y - py) * 0.22;
            this.puck.x = px + Math.cos(angle) * (minDist + 2);
            this.puck.y = py + Math.sin(angle) * (minDist + 2);
        }
    },

    loop() {
        ctx.clearRect(0,0,1000,600);
        ctx.drawImage(this.images['background.jpg'], 0, 0, 1000, 600);
        
        if(!this.isGoal) {
            if(this.mode === 'bot') this.updateBot();
            if(this.mode === 'bot' || this.role === 'p1') {
                this.updatePhysics();
                if(this.mode === 'online') socket.emit('puckSync', { x: this.puck.x, y: this.puck.y });
            }
        }

        ctx.drawImage(this.images['puck.png'], this.puck.x-35, this.puck.y-35, 70, 70);
        ctx.drawImage(this.images[STATS[this.hero].img], this.p1.x, this.p1.y, this.p1.w, this.p1.h);
        const enemyImg = this.mode === 'bot' ? 'kompot.png' : STATS[this.enemy.hero].img;
        ctx.drawImage(this.images[enemyImg], this.enemy.x, this.enemy.y, this.enemy.w, this.enemy.h);

        requestAnimationFrame(() => this.loop());
    },

    updateBot() {
        if(this.puck.x > 500) {
            this.enemy.y += (this.puck.y - this.enemy.y - this.enemy.h/2) * 0.06;
            this.enemy.x += (this.puck.x - this.enemy.x) * 0.04;
        } else {
            this.enemy.x += (810 - this.enemy.x) * 0.05;
            this.enemy.y += (300 - this.enemy.h/2 - this.enemy.y) * 0.05;
        }
    },

    goal(win) {
        this.isGoal = true;
        if(win) this.score.p1++; else this.score.p2++;
        document.getElementById('score-text').innerText = `${this.score.p1} : ${this.score.p2}`;
        setTimeout(() => {
            if(this.score.p1 >= 5 || this.score.p2 >= 5) this.endMatch(this.score.p1 >= 5);
            else { this.puck = { x: 500, y: 300, dx: 0, dy: 0, friction: 0.985 }; this.isGoal = false; }
        }, 2000);
    },

    async endMatch(win) {
        let e = this.elo;
        let diff = win ? (e<400?30:e<700?20:15) : (e<400?-5:e<700?-10:-10);
        this.elo += diff; if(this.elo < 200) this.elo = 200;
        await fetch('/api/save', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({elo:this.elo, hero:this.hero, win}) });
        location.reload();
    }
};
game.init();
