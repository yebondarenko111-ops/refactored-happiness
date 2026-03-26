const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const STATS = {
    korzhik:   { speed: 0.18, size: 90, img: 'korzhik.png', label: 'КОРЖИК' },
    karamelka: { speed: 0.25, size: 85, img: 'karamelka.png', label: 'КАРАМЕЛЬКА' },
    kompot:    { speed: 0.10, size: 110, img: 'kompot.png', label: 'КОМПОТ' },
    gona:      { speed: 0.18, size: 100, img: 'gona.png', label: 'ГОНЯ' }
};

const game = {
    user: null, elo: 200, hero: 'korzhik', role: null, roomId: null,
    p1: { x: 100, y: 250, w: 90, h: 90 },
    enemy: { x: 800, y: 245, w: 110, h: 110, hero: 'kompot' },
    puck: { x: 500, y: 300, dx: 0, dy: 0, friction: 0.985 },
    score: { p1: 0, p2: 0 }, images: {}, isGoal: false, goalAlpha: 0,

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
            this.roomId = d.roomId; this.role = d.role; this.enemy.hero = d.enemy.hero;
            this.startMatch();
        });
        socket.on('enemyMove', (d) => { this.enemy.x = d.x; this.enemy.y = d.y; });
        socket.on('puckUpdate', (d) => { if(this.role === 'p2') { this.puck.x = d.x; this.puck.y = d.y; }});
        socket.on('goalUpdate', (d) => { this.score = d.score; this.triggerGoal(d.msg); });
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

    startSearch() {
        document.getElementById('search-btn').innerText = "ПОШУК...";
        socket.emit('findGame', { user: this.user, hero: this.hero });
    },

    startMatch() {
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
            socket.emit('move', { roomId: this.roomId, x: this.p1.x, y: this.p1.y });
        });
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
        
        if(this.role === 'p1' && !this.isGoal) {
            this.puck.x += this.puck.dx; this.puck.y += this.puck.dy;
            this.puck.dx *= this.puck.friction; this.puck.dy *= this.puck.friction;
            if(this.puck.y < 65 || this.puck.y > 535) this.puck.dy *= -1;
            if(this.puck.x < 65) {
                if(this.puck.y > 210 && this.puck.y < 390) this.goal('p2');
                else { this.puck.x = 65; this.puck.dx *= -1; }
            }
            if(this.puck.x > 935) {
                if(this.puck.y > 210 && this.puck.y < 390) this.goal('p1');
                else { this.puck.x = 935; this.puck.dx *= -1; }
            }
            this.collide(this.p1); this.collide(this.enemy);
            socket.emit('puckSync', { roomId: this.roomId, x: this.puck.x, y: this.puck.y });
        }

        ctx.drawImage(this.images['puck.png'], this.puck.x-35, this.puck.y-35, 70, 70);
        ctx.drawImage(this.images[STATS[this.hero].img], this.p1.x, this.p1.y, this.p1.w, this.p1.h);
        ctx.drawImage(this.images[STATS[this.enemy.hero].img], this.enemy.x, this.enemy.y, this.enemy.w, this.enemy.h);

        if(this.isGoal) this.drawGoalAnim();
        requestAnimationFrame(() => this.loop());
    },

    goal(winner) {
        if(winner === 'p1') this.score.p1++; else this.score.p2++;
        const msg = winner === 'p1' ? "ГОЛ ВАМ!" : "ГОЛ СУПЕРНИКА!";
        socket.emit('goalSync', { roomId: this.roomId, score: this.score, msg });
        this.triggerGoal(msg);
    },

    triggerGoal(msg) {
        this.isGoal = true; this.goalText = msg; this.goalAlpha = 0;
        document.getElementById('score-text').innerText = `${this.score.p1} : ${this.score.p2}`;
        setTimeout(() => {
            if(this.score.p1 >= 5 || this.score.p2 >= 5) this.saveElo(this.score.p1 >= 5);
            else { this.puck = { x: 500, y: 300, dx: 0, dy: 0 }; this.isGoal = false; }
        }, 2000);
    },

    drawGoalAnim() {
        if(this.goalAlpha < 0.6) this.goalAlpha += 0.04;
        ctx.fillStyle = `rgba(0,0,0,${this.goalAlpha})`; ctx.fillRect(0,0,1000,600);
        ctx.fillStyle = "#ff9d00"; ctx.font = "bold 60px Arial"; ctx.textAlign = "center";
        ctx.fillText(this.goalText, 500, 300);
    },

    async saveElo(win) {
        let e = this.elo;
        let diff = win ? (e<400?30:e<700?20:15) : (e<400?-5:e<700?-10:-10);
        this.elo += diff; if(this.elo < 200) this.elo = 200;
        await fetch('/api/save', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({elo:this.elo, hero:this.hero, win}) });
        location.reload();
    }
};
game.init();
