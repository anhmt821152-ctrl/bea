const escapeHTML = (str) => String(str).replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[tag] || tag));

function getBadge(score) {
    if (score >= 1200) return { name: 'Kim cương', color: '#B9F2FF' };
    if (score >= 700) return { name: 'Vàng', color: '#FFD700' };
    if (score >= 300) return { name: 'Bạc', color: '#C0C0C0' };
    return { name: 'Đồng', color: '#cd7f32' };
}

// Race car seen from the side, nose to the right. The body colour is the team colour.
function createCarSVG(color) {
    return `<svg class="car-svg" viewBox="0 0 140 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <ellipse cx="70" cy="51" rx="58" ry="3.5" fill="rgba(0,0,0,.35)"/>
        <path d="M6,40 L6,30 Q6,26 11,25 L34,22 L50,9 Q52,7 56,7 L88,7 Q92,7 95,10 L108,22 L126,26 Q134,28 134,34 L134,40 Z" fill="${color}" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M52,12 L88,12 L102,23 L40,23 Z" fill="#0e1126" opacity=".85"/>
        <path d="M70,12 L70,23" stroke="${color}" stroke-width="3"/>
        <rect x="116" y="28" width="14" height="5" rx="2.5" fill="#ffd23f"/>
        <rect x="8" y="30" width="8" height="4" rx="2" fill="#ff5a76"/>
        <path d="M20,36 L120,36" stroke="rgba(255,255,255,.55)" stroke-width="2" stroke-linecap="round"/>
        <g class="wheel"><circle cx="32" cy="42" r="11" fill="#0e1126" stroke="#fff" stroke-width="2.5"/><circle cx="32" cy="42" r="4" fill="#fff"/><path d="M32,32 L32,52 M22,42 L42,42" stroke="#fff" stroke-width="1.5"/></g>
        <g class="wheel"><circle cx="106" cy="42" r="11" fill="#0e1126" stroke="#fff" stroke-width="2.5"/><circle cx="106" cy="42" r="4" fill="#fff"/><path d="M106,32 L106,52 M96,42 L116,42" stroke="#fff" stroke-width="1.5"/></g>
    </svg>`;
}

// Countdown driven by the clock (not by counting ticks), so it stays accurate
// even when a mobile browser throttles timers. Returns a function that stops it.
function startCountdown(el, seconds) {
    const endAt = Date.now() + seconds * 1000;
    let id = null;
    const tick = () => {
        const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
        el.innerText = `${left}s`;
        el.classList.toggle('urgent', left <= 5 && left > 0);
        if (left <= 0 && id) { clearInterval(id); id = null; }
    };
    tick();
    id = setInterval(tick, 250);
    return () => { if (id) { clearInterval(id); id = null; } };
}

// Paper confetti on a full-screen canvas. Runs for ~4 seconds and then clears itself.
function launchConfetti(canvas, colors) {
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width = window.innerWidth * dpr;
    const h = canvas.height = window.innerHeight * dpr;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    const pieces = Array.from({ length: 160 }, () => ({
        x: Math.random() * w, y: -Math.random() * h * 0.6,
        vx: (Math.random() - 0.5) * 3 * dpr, vy: (2 + Math.random() * 4) * dpr,
        size: (6 + Math.random() * 8) * dpr, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        color: colors[Math.floor(Math.random() * colors.length)]
    }));
    const start = performance.now();
    (function frame(now) {
        const t = now - start;
        ctx.clearRect(0, 0, w, h);
        if (t > 4200) return;
        pieces.forEach(p => {
            p.x += p.vx; p.y += p.vy; p.rot += p.vr;
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            ctx.globalAlpha = Math.min(1, (4200 - t) / 800);
            ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
            ctx.restore();
        });
        requestAnimationFrame(frame);
    })(start);
}

// ---------------------------------------------------------------------------
// Question sets: made in the editor, stored in the host's own browser
// ---------------------------------------------------------------------------
const SETS_KEY = 'qb.sets.v1';
const DEFAULT_SET_ID = 'default';
// Seconds a question stays open. Same limits as the server.
const MIN_TIME = 5;
const MAX_TIME = 300;
const TIME_CHOICES = [10, 15, 20, 30, 45, 60, 90, 120];
const validTime = (t) => Number.isInteger(t) && t >= MIN_TIME && t <= MAX_TIME;

function loadSetStore() {
    try {
        const raw = JSON.parse(localStorage.getItem(SETS_KEY));
        if (raw && Array.isArray(raw.sets)) {
            // defaultTime is null until the host picks one; then the server's default is used.
            return { sets: raw.sets, selected: raw.selected || DEFAULT_SET_ID, defaultTime: validTime(raw.defaultTime) ? raw.defaultTime : null };
        }
    } catch (e) {}
    return { sets: [], selected: DEFAULT_SET_ID, defaultTime: null };
}

function saveSetStore(store) {
    try { localStorage.setItem(SETS_KEY, JSON.stringify(store)); return true; } catch (e) { return false; }
}

// Same rules as the server: text, exactly 4 non-empty options, answer 0-3.
function questionProblems(q) {
    const problems = [];
    if (!q.text || !q.text.trim()) problems.push('Chưa có nội dung câu hỏi');
    else if (q.text.trim().length > 200) problems.push('Câu hỏi dài quá 200 ký tự');
    if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some(o => !o || !String(o).trim())) problems.push('Cần điền đủ 4 đáp án');
    else if (q.options.some(o => String(o).trim().length > 100)) problems.push('Có đáp án dài quá 100 ký tự');
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) problems.push('Chưa chọn đáp án đúng');
    if (q.time !== undefined && q.time !== null && !validTime(q.time)) problems.push(`Thời gian phải từ ${MIN_TIME} đến ${MAX_TIME} giây`);
    return problems;
}

function setIsReady(set) {
    return Array.isArray(set.questions) && set.questions.length > 0 && set.questions.length <= 50 &&
        set.questions.every(q => questionProblems(q).length === 0);
}
