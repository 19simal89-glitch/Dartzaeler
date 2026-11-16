'use strict';
/* Dartzähler – komplett offline. Spielmodi: 301/501/701, Round the Clock, Cricket. */

// ================= Speicher =================
const Store = {
  load() {
    try {
      const s = window.AndroidStore ? AndroidStore.load() : localStorage.getItem('dartzaehler');
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  },
  save(d) {
    try {
      const s = JSON.stringify(d);
      if (window.AndroidStore) AndroidStore.save(s); else localStorage.setItem('dartzaehler', s);
    } catch (e) { /* ignorieren */ }
  }
};

const DEF_SETTINGS = { mode: '501', in: 'single', out: 'double', input: 'darts', legs: 1, rtcSkip: false, rtcBull: true, crCut: false, selected: [] };
const DB = { players: [], settings: { ...DEF_SETTINGS }, current: null };
(function () {
  const d = Store.load();
  if (!d) return;
  DB.players = Array.isArray(d.players) ? d.players : [];
  const old = DB.players.filter(p => !p.stats || !('legsPlayed' in p.stats));
  DB.players.forEach(p => { p.stats = Object.assign(newStats(), p.stats || {}); if (!Array.isArray(p.log)) p.log = []; });
  if (old.length) window._dzMigrate = old;   // läuft erst nach dem Laden aller Hilfsfunktionen (siehe Dateiende)
  DB.settings = Object.assign({}, DEF_SETTINGS, d.settings || {});
  DB.current = d.current || null;
})();
// Alte Daten (vor der Leg-Statistik): gespielte Legs je Spiel aus den Logs aller Spieler rekonstruieren.
// Spiele mit gleichem Zeitstempel gehören zum selben Match; dessen Leg-Anzahl = Summe der gewonnenen Legs.
function migrateLegs(players) {
  const perMatch = {};
  DB.players.forEach(p => (p.log || []).forEach(e => { perMatch[e.t] = (perMatch[e.t] || 0) + (e.legs || 0); }));
  players.forEach(p => {
    const s = p.stats, logged = { x: [0, 0, 0], cricket: [0, 0, 0], rtc: [0, 0, 0] };  // [Spiele, gespielte Legs, gewonnene Legs]
    p.log.forEach(e => {
      if (e.legsPlayed === undefined) e.legsPlayed = Math.max(1, perMatch[e.t] || 0);
      const k = isX01(e.mode) ? 'x' : e.mode;
      logged[k][0]++; logged[k][1] += e.legsPlayed; logged[k][2] += e.legs;
    });
    // Spiele ohne Log-Eintrag (ganz alte Daten): mindestens 1 Leg je Spiel annehmen
    const games = { x: s.games - s.crGames - s.rtcGames, cricket: s.crGames, rtc: s.rtcGames };
    const add = k => logged[k][1] + Math.max(0, games[k] - logged[k][0]);
    s.xLegs = add('x'); s.crLegs = add('cricket'); s.rtcLegs = add('rtc');
    s.legsPlayed = Math.max(s.legs, s.xLegs + s.crLegs + s.rtcLegs);
  });
  persist();
}
function persist() { Store.save(DB); }

function newStats() {
  return { games: 0, wins: 0, legs: 0, legsPlayed: 0, xLegs: 0, xPts: 0, xDarts: 0, hi: 0, co: 0, n180: 0, best: {},
    crMarks: 0, crRounds: 0, crGames: 0, crLegs: 0, rtcBest: 0, rtcGames: 0, rtcLegs: 0, dA: 0, dH: 0 };
}

// ================= Hilfen =================
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const isX01 = m => m === '301' || m === '501' || m === '701';
const CR_NUMS = [20, 19, 18, 17, 16, 15, 25];
const IMPOSSIBLE = [163, 166, 169, 172, 173, 175, 176, 178, 179];
const IN_LABEL = { single: 'Single In', double: 'Double In', master: 'Master In' };
const OUT_LABEL = { single: 'Single Out', double: 'Double Out', master: 'Master Out' };
const ICON_UNDO = '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>';
const ICON_BACK = '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const BOARD_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
// Dartscheibe nach Turniermaßen (mm): Bull 6,35 · Single-Bull 15,9 · Triple 99–107 · Double 162–170
function boardSvg() {
  const RB = 6.35, ROB = 15.9, TI = 99, TO = 107, DI = 162, DO = 170;
  const BLACK = '#1c1c1c', CREAM = '#f1e4c3', RED = '#d42a2f', GREEN = '#178a47', WIRE = '#b8bcc4';
  const rad = deg => deg * Math.PI / 180;
  const pt = (r, a) => (r * Math.cos(a)).toFixed(2) + ' ' + (r * Math.sin(a)).toFixed(2);
  const sector = (r1, r2, a1, a2, fill) =>
    `<path d="M${pt(r2, a1)}A${r2} ${r2} 0 0 1 ${pt(r2, a2)}L${pt(r1, a2)}A${r1} ${r1} 0 0 0 ${pt(r1, a1)}Z" fill="${fill}"/>`;
  let segs = '', wires = '', nums = '';
  BOARD_ORDER.forEach((n, i) => {
    const c = rad(i * 18 - 90), a1 = c - rad(9), a2 = c + rad(9);
    const single = i % 2 ? CREAM : BLACK, ring = i % 2 ? GREEN : RED;
    segs += sector(ROB, TI, a1, a2, single) + sector(TI, TO, a1, a2, ring) + sector(TO, DI, a1, a2, single) + sector(DI, DO, a1, a2, ring);
    wires += `<path d="M${pt(ROB, a1)}L${pt(DO, a1)}"/>`;
    const [x, y] = pt(197, c).split(' ');
    nums += `<text x="${x}" y="${y}">${n}</text>`;
  });
  return `<svg viewBox="-232 -232 464 464" class="dartboard" role="img" aria-label="Dartscheibe">
    <circle r="230" fill="#111"/><circle r="226" fill="#0c0c0c" stroke="#3a3a3a" stroke-width="3"/>
    ${segs}<circle r="${ROB}" fill="${GREEN}"/><circle r="${RB}" fill="${RED}"/>
    <g fill="none" stroke="${WIRE}" stroke-width="1.3">${wires}${[ROB, TI, TO, DI, DO].map(r => `<circle r="${r}"/>`).join('')}<circle r="${RB}"/></g>
    <circle r="${DO + 1.5}" fill="none" stroke="#d9dce1" stroke-width="2.5"/>
    <g fill="#f4f4f4" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="34" text-anchor="middle" dominant-baseline="central">${nums}</g>
  </svg>`;
}
const LOGO = boardSvg();

function dartName(d) {
  if (d.sum !== undefined) return 'Σ' + d.sum;
  if (!d.n) return '0';
  if (d.n === 25) return d.m === 2 ? 'Bull' : '25';
  return (d.m === 3 ? 'T' : d.m === 2 ? 'D' : '') + d.n;
}
const dartVal = d => d.sum !== undefined ? d.sum : d.n * d.m;
const inOk = (d, mode) => !mode || mode === 'single' || (mode === 'double' && d.m === 2) || (mode === 'master' && d.m >= 2);
const finOk = (d, out) => out === 'single' || (out === 'double' && d.m === 2) || (out === 'master' && d.m >= 2);
function modeLabel(g) {
  if (isX01(g.mode)) return g.mode + (g.opts.in && g.opts.in !== 'single' ? ' · ' + IN_LABEL[g.opts.in] : '') + ' · ' + OUT_LABEL[g.opts.out];
  if (g.mode === 'cricket') return 'Cricket' + (g.opts.crCut ? ' · Cut Throat' : '');
  return 'Round the Clock' + (g.opts.rtcSkip ? ' · Skip' : '');
}
function rtcTargets(o) { const t = []; for (let i = 1; i <= 20; i++) t.push(i); if (o.rtcBull) t.push(25); return t; }
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const fmt1 = (a, b, f = 1) => b ? (a / b * f).toFixed(f === 3 ? 1 : 2) : '–';

// ================= Checkout-Vorschläge =================
const SEGS = (() => { const a = []; for (let n = 20; n >= 1; n--) for (let m = 3; m >= 1; m--) a.push({ n, m }); a.push({ n: 25, m: 1 }, { n: 25, m: 2 }); return a; })();
const GOOD_D = { 20: 0, 16: 0, 18: 1, 10: 1, 12: 1, 8: 1, 14: 2, 4: 2, 6: 2, 25: 3, 2: 5, 1: 6 };
function setupCost(d) {
  if (d.m === 3) return d.n === 20 ? 0 : d.n === 19 ? 1 : d.n >= 17 ? 2 : d.n >= 10 ? 4 : 6;
  if (d.m === 1) return d.n === 25 ? 3 : 2;
  return d.n === 25 ? 6 : 7;
}
function finCost(d, out) {
  if (out === 'single') return d.m === 1 ? (d.n === 25 ? 2 : 0) : 1;
  if (d.m === 2) return d.n in GOOD_D ? GOOD_D[d.n] : 3;
  return 2;
}
const coCache = {};
// Feste Checkout-Wege (Standard-Tabelle, Double Out) für 41–170; gelten auch für Master Out.
// Reicht die Dart-Anzahl nicht für den Tabellenweg, wird ein Weg berechnet.
const CO_TABLE = (() => {
  const t = {}, M = { S: 1, D: 2, T: 3 };
  ('170 T20 T20 D25|167 T20 T19 D25|164 T20 T18 D25|161 T20 T17 D25|160 T20 T20 D20|158 T20 T20 D19|157 T20 T19 D20|156 T20 T20 D18|155 T20 T19 D19|154 T20 T18 D20|153 T20 T19 D18|152 T20 T20 D16|151 T20 T17 D20|150 T20 T18 D18|149 T20 T19 D16|148 T20 T16 D20|147 T20 T17 D18|146 T19 T19 D16|145 T19 T20 D14|144 T20 T20 D12|143 T20 T17 D16|142 T18 T20 D14|141 T20 T19 D12|140 T20 T20 D10|139 T19 T14 D20|138 T20 T18 D12|137 T20 T15 D16|136 T20 T20 D8|135 S25 T20 D25|134 T20 T14 D16|133 T20 T11 D20|132 D25 T14 D20|131 T20 T13 D16|130 T20 T20 D5|129 T19 T16 D12|128 T18 T14 D16|127 T20 T17 D8|126 T19 T19 D6|125 D25 T17 D12|124 T20 T16 D8|123 T19 T16 D9|122 T18 T18 D7|121 T20 T11 D14|120 T20 S20 D20|119 T19 T12 D13|118 T20 S18 D20|117 T20 S17 D20|116 T20 S16 D20|115 T20 S15 D20|114 T20 S14 D20|113 T19 S16 D20|112 T20 S12 D20|111 T20 S11 D20|110 T20 S10 D20|109 T20 S9 D20|108 T20 S16 D16|107 T19 S18 D16|106 T20 S14 D16|105 T20 S13 D16|104 T18 S18 D16|103 T19 S14 D16|102 T20 S10 D16|101 T20 S9 D16|100 T20 D20|99 T19 S10 D16|98 T20 D19|97 T19 D20|96 T20 D18|95 T19 D19|94 T18 D20|93 T19 D18|92 T20 D16|91 T17 D20|90 T20 D15|89 T19 D16|88 T20 D14|87 T17 D18|86 T18 D16|85 T15 D20|84 T20 D12|83 T17 D16|82 D25 D16|81 T19 D12|80 T20 D10|79 T19 D11|78 T18 D12|77 T19 D10|76 T20 D8|75 T17 D12|74 T14 D16|73 T17 D11|72 T16 D12|71 T13 D16|70 T18 D8|69 T15 D12|68 T20 D4|67 T17 D8|66 T10 D18|65 T11 D16|64 T16 D8|63 T13 D12|62 T10 D16|61 T15 D8|60 S20 D20|59 S19 D20|58 S18 D20|57 S17 D20|56 S16 D20|55 S15 D20|54 S14 D20|53 S13 D20|52 S12 D20|51 S19 D16|50 S18 D16|49 S9 D20|48 S16 D16|47 S15 D16|46 S14 D16|45 S13 D16|44 S12 D16|43 S11 D16|42 S10 D16|41 S9 D16').split('|').forEach(r => {
    const [s, ...d] = r.split(' ');
    t[s] = d.map(x => ({ n: +x.slice(1), m: M[x[0]] }));
  });
  return t;
})();
function checkout(score, darts, out) {
  const key = score + '|' + darts + '|' + out;
  if (key in coCache) return coCache[key];
  const tab = out !== 'single' && CO_TABLE[score];
  if (tab && tab.length <= darts) return (coCache[key] = tab);
  let res = null;
  if (score > 0 && score <= 180 && darts > 0) {
    const fins = SEGS.filter(d => finOk(d, out));
    for (let k = 1; k <= darts && !res; k++) {
      let best = null, bc = 1e9;
      if (k === 1) {
        for (const f of fins) if (f.n * f.m === score) { const c = finCost(f, out); if (c < bc) { bc = c; best = [f]; } }
      } else if (k === 2) {
        for (const a of SEGS) {
          const r = score - a.n * a.m; if (r <= 0) continue;
          for (const f of fins) if (f.n * f.m === r) { const c = setupCost(a) + finCost(f, out); if (c < bc) { bc = c; best = [a, f]; } }
        }
      } else {
        for (const a of SEGS) {
          const r1 = score - a.n * a.m; if (r1 <= 0) continue;
          for (const b of SEGS) {
            const r = r1 - b.n * b.m; if (r <= 0) continue;
            for (const f of fins) if (f.n * f.m === r) {
              const c = setupCost(a) + setupCost(b) + finCost(f, out) + (b.n * b.m > a.n * a.m ? 0.5 : 0);
              if (c < bc) { bc = c; best = [a, b, f]; }
            }
          }
        }
      }
      res = best;
    }
  }
  return (coCache[key] = res);
}

// ================= Spiel-Engine =================
let G = null, hist = [];
let mod = 1, sumBuf = '';

function newGame(players, s) {
  const g = {
    mode: s.mode,
    opts: { in: s.in || 'single', out: s.out, input: s.input, legs: s.legs, rtcSkip: s.rtcSkip, rtcBull: s.rtcBull, crCut: s.crCut },
    players: players.map(p => ({ id: p.id, name: p.name })),
    legsWon: players.map(() => 0), leg: 1, starter: 0, cur: 0, turn: [], phase: 'play', legWinner: null,
    stats: players.map(() => ({ pts: 0, darts: 0, hi: 0, co: 0, n180: 0, legDarts: [], marks: 0, rounds: 0, rtcDarts: [], dA: 0 })),
    ps: null
  };
  initLeg(g);
  return g;
}
function initLeg(g) {
  g.ps = g.players.map(() => {
    if (isX01(g.mode)) return { score: +g.mode, ts: +g.mode, darts: 0, last: null, in: !g.opts.in || g.opts.in === 'single' };
    if (g.mode === 'cricket') { const marks = {}; CR_NUMS.forEach(n => (marks[n] = 0)); return { marks, pts: 0, darts: 0, last: null }; }
    return { idx: 0, darts: 0, last: null };
  });
  g.cur = g.starter; g.turn = []; g.phase = 'play'; g.legWinner = null;
  g.stats.forEach(st => (st.lhi = 0));
  g.base = JSON.parse(JSON.stringify(g.stats));   // Stand zu Leg-Beginn -> Differenz = Statistik dieses Legs
}
function snap() { hist.push(JSON.stringify(G)); if (hist.length > 120) hist.shift(); }
function saveGame() { DB.current = { G, hist }; persist(); }
function undo() {
  if (!hist.length) return toast('Nichts zum Rückgängigmachen');
  const prev = JSON.parse(hist.pop());
  // Wird ein gewonnenes Leg rückgängig gemacht, auch dessen Statistik-Eintrag zurücknehmen
  if (G.statBak && (!prev.statBak || prev.statBak.leg !== G.statBak.leg)) rollbackLeg(G.statBak);
  G = prev; mod = 1; sumBuf = '';
  saveGame(); render();
}

function throwDart(n, m) {
  if (G.phase !== 'play') return;
  snap();
  const r = isX01(G.mode) ? x01Dart({ n, m }) : G.mode === 'cricket' ? crDart({ n, m }) : rtcDart(m);
  if (r === 'leg') legWon();
  else if (r === 'bust' || G.turn.length >= 3) endTurn(r === 'bust');
  mod = 1;
  saveGame(); render();
}

function x01Dart(d) {
  const p = G.ps[G.cur], st = G.stats[G.cur], out = G.opts.out;
  G.turn.push(d); p.darts++; st.darts++;
  if (p.in === false) {                      // Double/Master In: zählt erst ab dem Einstiegs-Dart
    if (!inOk(d, G.opts.in)) return 'ok';
    p.in = true;
  } else if (finChance(p.score, out)) st.dA = (st.dA || 0) + 1;   // Dart auf ein mögliches Finish-Doppel
  const rest = p.score - d.n * d.m;
  if (rest < 0 || (rest === 1 && out !== 'single') || (rest === 0 && !finOk(d, out))) { p.score = p.ts; return 'bust'; }
  p.score = rest;
  return rest === 0 ? 'leg' : 'ok';
}

// Rest mit einem einzigen Dart checkbar (= Versuch auf das Finish-Doppel); bei Single Out nicht gezählt
function finChance(score, out) { return out !== 'single' && !!checkout(score, 1, out); }

function crDart(d) {
  const i = G.cur, p = G.ps[i], st = G.stats[i];
  G.turn.push(d); p.darts++; st.darts++;
  if (!CR_NUMS.includes(d.n)) return 'ok';
  const have = p.marks[d.n], tot = have + d.m;
  const closing = Math.min(d.m, Math.max(0, 3 - have));
  const excess = tot > 3 ? Math.min(d.m, tot - 3) : 0;
  p.marks[d.n] = Math.min(3, tot);
  st.marks += closing;
  if (excess) {
    const open = G.ps.filter((o, j) => j !== i && o.marks[d.n] < 3);
    if (open.length) {
      st.marks += excess;
      if (G.opts.crCut) open.forEach(o => (o.pts += excess * d.n)); else p.pts += excess * d.n;
    }
  }
  return crIsWinner(i) ? 'leg' : 'ok';
}
function crIsWinner(i) {
  const p = G.ps[i];
  if (!CR_NUMS.every(n => p.marks[n] >= 3)) return false;
  const others = G.ps.filter((o, j) => j !== i);
  return G.opts.crCut ? others.every(o => p.pts <= o.pts) : others.every(o => p.pts >= o.pts);
}

function rtcDart(m) {
  const i = G.cur, p = G.ps[i], st = G.stats[i], T = rtcTargets(G.opts);
  const target = T[p.idx];
  G.turn.push(m ? { n: target, m } : { n: 0, m: 1 });
  p.darts++; st.darts++;
  if (m) {
    const max = (G.opts.rtcBull && p.idx < 20) ? 20 : T.length; // Bull muss extra getroffen werden
    p.idx = Math.min(max, p.idx + (G.opts.rtcSkip ? m : 1));
  }
  return p.idx >= T.length ? 'leg' : 'ok';
}

function endTurn(bust) {
  const n = G.players.length, p = G.ps[G.cur], st = G.stats[G.cur];
  let total = null;
  if (isX01(G.mode)) {
    total = bust ? 0 : p.ts - p.score;
    st.pts += total; if (total > st.hi) st.hi = total; if (total > (st.lhi || 0)) st.lhi = total; if (total === 180) st.n180++;
    p.ts = p.score;
  }
  if (G.mode === 'cricket') st.rounds++;
  p.last = { darts: G.turn.slice(), total, bust };
  G.turn = [];
  G.cur = (G.cur + 1) % n;
  const next = n > 1 ? '→ ' + esc(G.players[G.cur].name) : '';
  if (isX01(G.mode)) flash(bust ? 'BUST' : String(total), next, bust);
  else if (n > 1) flash(esc(G.players[G.cur].name), 'ist dran');
}

function legWon() {
  const i = G.cur, p = G.ps[i], st = G.stats[i];
  let total = null;
  if (isX01(G.mode)) {
    total = p.ts;
    st.pts += total; if (total > st.hi) st.hi = total; if (total > (st.lhi || 0)) st.lhi = total; if (total === 180) st.n180++;
    if (total > st.co) st.co = total;
    st.legDarts.push(p.darts);
  }
  if (G.mode === 'cricket') st.rounds++;
  if (G.mode === 'rtc') st.rtcDarts.push(p.darts);
  p.last = { darts: G.turn.slice(), total, bust: false, fin: true };
  G.legsWon[i]++; G.legWinner = i;
  G.phase = G.legsWon[i] >= G.opts.legs ? 'matchEnd' : 'legEnd';
  commitLeg();
}

function nextLeg() {
  snap();
  G.leg++;
  // Reihenfolge drehen: Spieler 1 wird Letzter, alle anderen rücken einen Platz nach vorne
  [G.players, G.legsWon, G.stats].forEach(a => a.push(a.shift()));
  G.starter = 0;
  initLeg(G); mod = 1; sumBuf = '';
  saveGame(); render();
}

// Summen-Eingabe (X01)
function enterTotal() {
  if (G.phase !== 'play' || sumBuf === '') return;
  const v = +sumBuf, out = G.opts.out;
  const p = G.ps[G.cur];
  if (v > 180 || IMPOSSIBLE.includes(v)) { sumBuf = ''; render(); return toast(v + ' ist mit 3 Darts nicht möglich'); }
  const rest = p.score - v;
  if (rest === 0) {
    const co = checkout(v, 3, out);
    if (!co) { sumBuf = ''; render(); return toast(v + ' ist mit ' + OUT_LABEL[out] + ' nicht checkbar'); }
    const btns = [1, 2, 3].filter(k => k >= co.length).map(k => ({ label: k + (k === 1 ? ' Dart' : ' Darts'), cls: 'pri', fn: () => finishSum(v, k) }));
    btns.push({ label: 'Abbrechen', cls: 'ghost' });
    modal('Checkout ' + v + '!', 'Wie viele Darts wurden für diese Aufnahme gebraucht?', btns, true);
    return;
  }
  snap();
  const st = G.stats[G.cur];
  p.darts += 3; st.darts += 3;
  if (p.in !== false && finChance(p.ts, out)) st.dA = (st.dA || 0) + 3;   // Summen-Eingabe: Näherung
  G.turn = [{ sum: v }];
  if (p.in === false && v > 0) p.in = true;
  const bust = rest < 0 || (rest === 1 && out !== 'single');
  p.score = bust ? p.ts : rest;
  endTurn(bust);
  sumBuf = '';
  saveGame(); render();
}
function finishSum(v, k) {
  snap();
  const p = G.ps[G.cur], st = G.stats[G.cur];
  p.darts += k; st.darts += k; p.score = 0;
  if (G.opts.out !== 'single') st.dA = (st.dA || 0) + (finChance(v, G.opts.out) ? k : 1);
  G.turn = [{ sum: v }];
  legWon(); sumBuf = '';
  saveGame(); render();
}

// Statistik wird nach jedem Leg gespeichert (ein Log-Eintrag je Spieler und Leg)
function commitLeg() {
  const t = Date.now(), w = G.legWinner, b = G.base, bak = { leg: G.leg, data: {} };
  if (!G.gid) G.gid = uid();
  G.players.forEach((pl, i) => {
    const P = DB.players.find(x => x.id === pl.id); if (!P) return;
    bak.data[P.id] = { stats: JSON.stringify(P.stats), logLen: (P.log || []).length };
    const st = G.stats[i], o = b ? b[i] : null, d = k => (st[k] || 0) - (o ? o[k] || 0 : 0);
    const e = {
      t, gid: G.gid, leg: G.leg, mode: G.mode,
      win: i === w && G.phase === 'matchEnd',
      // Spielstand aus der Zeit vor der Leg-Statistik (ohne Basis): bisherige Legs mitzählen
      legs: o ? (i === w ? 1 : 0) : G.legsWon[i], legsPlayed: o ? 1 : G.leg,
      pts: d('pts'), darts: d('darts'), dA: d('dA'), dH: i === w && isX01(G.mode) && G.opts.out !== 'single' ? 1 : 0, n180: d('n180'), marks: d('marks'), rounds: d('rounds'),
      hi: o ? (st.lhi || 0) : st.hi, co: i === w && isX01(G.mode) ? (G.ps[i].last && G.ps[i].last.total) || 0 : 0,
      legDarts: st.legDarts.slice(o ? o.legDarts.length : 0), rtcDarts: st.rtcDarts.slice(o ? o.rtcDarts.length : 0)
    };
    if (!o && G.leg > 1) e.leg = 1;   // zählt dann als neues Spiel
    addEntry(P.stats, e);
    (P.log = P.log || []).push(e);
  });
  G.statBak = bak;
  persist();
}
function rollbackLeg(bak) {
  Object.keys(bak.data).forEach(id => {
    const P = DB.players.find(x => x.id === id); if (!P) return;
    P.stats = JSON.parse(bak.data[id].stats);
    if (P.log) P.log.length = Math.min(P.log.length, bak.data[id].logLen);
  });
}
function endGame() { DB.current = null; persist(); }

// Ein beendetes Spiel in eine Statistik einrechnen
function addEntry(s, e) {
  const lp = e.legsPlayed || Math.max(1, e.legs);
  const ng = !e.leg || e.leg === 1 ? 1 : 0;   // erster Leg-Eintrag eines Spiels zählt als Spiel
  s.games += ng; if (e.win) s.wins++; s.legs += e.legs; s.legsPlayed += lp;
  if (isX01(e.mode)) {
    s.xLegs += lp;
    s.xPts += e.pts; s.xDarts += e.darts;
    s.dA = (s.dA || 0) + (e.dA || 0); s.dH = (s.dH || 0) + (e.dH || 0);
    s.hi = Math.max(s.hi, e.hi); s.co = Math.max(s.co, e.co); s.n180 += e.n180;
    e.legDarts.forEach(d => { if (!s.best[e.mode] || d < s.best[e.mode]) s.best[e.mode] = d; });
  } else if (e.mode === 'cricket') {
    s.crMarks += e.marks; s.crRounds += e.rounds; s.crGames += ng; s.crLegs += lp;
  } else {
    s.rtcGames += ng; s.rtcLegs += lp;
    e.rtcDarts.forEach(d => { if (!s.rtcBest || d < s.rtcBest) s.rtcBest = d; });
  }
}
function periodStart(per) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (per === 'week') d.setDate(d.getDate() - (d.getDay() + 6) % 7);   // Montag
  else d.setDate(1);                                                   // Monatserster
  return d;
}
function statsFor(p, per) {
  if (per !== 'week' && per !== 'month') return p.stats;
  const from = periodStart(per).getTime(), s = newStats();
  (p.log || []).filter(e => e.t >= from).forEach(e => addEntry(s, e));
  return s;
}

// ================= Navigation =================
let view = { v: 'home' }, stack = [];
function go(v, p = {}) { stack.push(view); view = { v, ...p }; render(true); }
function back() { view = stack.pop() || { v: 'home' }; render(true); }
function home() { stack = []; view = { v: 'home' }; render(true); }

function render(fresh) {
  const sc = document.querySelector('#app .scroll');
  const keep = !fresh && sc ? sc.scrollTop : 0;
  const fn = { home: vHome, setup: vSetup, game: vGame, players: vPlayers, player: vPlayer, rules: vRules }[view.v] || vHome;
  $('#app').innerHTML = fn();
  const sc2 = document.querySelector('#app .scroll');
  if (sc2) sc2.scrollTop = keep;
  if (view.v === 'game') {
    const c = document.querySelector('.pc.cur');
    if (c) c.scrollIntoView({ block: 'nearest' });
  }
}

// ================= Ansichten =================
function topBar(title, extra = '') {
  return `<div class="top"><button class="ib" data-a="back">${ICON_BACK}</button><h2>${title}</h2>${extra}</div>`;
}

// Versionsnummer kommt aus dem AndroidManifest (versionName), damit sie nur dort gepflegt wird
function appVersion() {
  try { if (window.AndroidStore && AndroidStore.version) return AndroidStore.version(); } catch (e) {}
  return '1.2';
}
function vHome() {
  let h = `<div class="screen"><div class="scroll home"><div class="hero">${LOGO}<h1>Dartzähler</h1><p>301 · 501 · 701 · Round the Clock · Cricket</p></div>`;
  const c = DB.current;
  if (c && c.G) {
    const g = c.G;
    h += `<div class="card resume"><b>Laufendes Spiel</b><div class="muted" style="margin:4px 0 12px">${esc(modeLabel(g))} · ${g.players.map(p => esc(p.name)).join(', ')}</div>
      <div class="row"><button class="btn pri" data-a="resume">Fortsetzen</button><button class="btn ghost" data-a="discard">Verwerfen</button></div></div>`;
  }
  h += `<div class="menu"><button class="btn gold" data-a="go" data-v="setup">Neues Spiel</button>
    <button class="btn" data-a="go" data-v="players">Spieler &amp; Statistik</button>
    <button class="btn" data-a="go" data-v="rules">Spielregeln</button></div>
    <div class="foot">Dartzähler V${esc(appVersion())} by Simon Florian</div></div></div>`;
  return h;
}

function selectedIds() {
  const S = DB.settings;
  S.selected = (S.selected || []).filter(id => DB.players.some(p => p.id === id));
  return S.selected;
}

function vSetup() {
  const S = DB.settings, sel = selectedIds();
  const segBtn = (k, v, label) => `<button class="${S[k] === v ? 'on' : ''}" data-a="set" data-k="${k}" data-v="${v}">${label}</button>`;
  const tog = (k, label, sub) => `<button class="tog" data-a="tog" data-k="${k}"><span>${label}<small>${sub}</small></span><i class="sw ${S[k] ? 'on' : ''}"></i></button>`;
  let h = `<div class="screen">${topBar('Neues Spiel')}<div class="scroll">
    <div class="sec">Spielmodus</div>
    <div class="seg">${segBtn('mode', '301', '301')}${segBtn('mode', '501', '501')}${segBtn('mode', '701', '701')}</div>
    <div class="seg wide mt">${segBtn('mode', 'rtc', 'Round the Clock')}${segBtn('mode', 'cricket', 'Cricket')}</div>`;
  if (isX01(S.mode)) {
    h += `<div class="sec">Check-In</div><div class="seg">${segBtn('in', 'single', 'Single In')}${segBtn('in', 'double', 'Double In')}${segBtn('in', 'master', 'Master In')}</div>
      <div class="sec">Check-Out</div><div class="seg">${segBtn('out', 'single', 'Single Out')}${segBtn('out', 'double', 'Double Out')}${segBtn('out', 'master', 'Master Out')}</div>
      <div class="sec">Eingabe</div><div class="seg">${segBtn('input', 'darts', 'Pro Dart')}${segBtn('input', 'sum', 'Summe je Aufnahme')}</div>`;
  } else if (S.mode === 'rtc') {
    h += `<div class="sec">Optionen</div>${tog('rtcBull', 'Bull zum Abschluss', 'Nach der 20 muss noch das Bull getroffen werden')}
      ${tog('rtcSkip', 'Double/Triple springen', 'Double = 2 Felder, Triple = 3 Felder weiter')}`;
  } else {
    h += `<div class="sec">Optionen</div>${tog('crCut', 'Cut Throat', 'Punkte gehen an die Gegner – wenig Punkte gewinnen')}`;
  }
  h += `<div class="sec">Legs zum Sieg</div><div class="step"><span>First to</span>
    <button class="ib" data-a="legs" data-d="-1">−</button><b>${S.legs}</b><button class="ib" data-a="legs" data-d="1">+</button></div>
    <div class="sec">Spieler <span style="text-transform:none;letter-spacing:0">– Reihenfolge = Antipp-Reihenfolge</span></div>`;
  if (!DB.players.length) h += `<div class="empty">Noch keine Spieler gespeichert.</div>`;
  h += '<div class="plgrid">';
  DB.players.forEach(p => {
    const k = sel.indexOf(p.id);
    h += `<button class="li ${k >= 0 ? 'on' : ''}" data-a="sel" data-id="${p.id}"><span class="ord">${k >= 0 ? k + 1 : ''}</span>
      <span class="nm"><b>${esc(p.name)}</b><small>${legLine(p.stats, true)}</small></span></button>`;
  });
  h += '</div>';
  h += `<div class="row mt"><button class="btn ghost" data-a="addPl" data-sel="1">+ Neuer Spieler</button>
    <button class="btn ghost" data-a="shuffle" ${sel.length < 2 ? 'disabled' : ''}>Mischen</button></div>
    </div><div class="bottom"><button class="btn pri" data-a="start" ${sel.length ? '' : 'disabled'}>Spiel starten${sel.length ? ' (' + sel.length + ' Spieler)' : ''}</button></div></div>`;
  return h;
}

function vPlayers() {
  let h = `<div class="screen">${topBar('Spieler')}<div class="scroll">`;
  if (!DB.players.length) h += `<div class="empty">Noch keine Spieler. Lege den ersten an!</div>`;
  DB.players.forEach(p => {
    const s = p.stats;
    h += `<button class="li" data-a="go" data-v="player" data-id="${p.id}"><span class="nm"><b>${esc(p.name)}</b>
      <small>${legLine(s)} · X01 Ø ${fmt1(s.xPts, s.xDarts, 3)}</small></span><span class="chev">›</span></button>`;
  });
  h += `<button class="btn pri mt" data-a="addPl">+ Spieler hinzufügen</button></div></div>`;
  return h;
}

function vPlayer() {
  const p = DB.players.find(x => x.id === view.id);
  if (!p) return vPlayers();
  const per = view.per || 'all', s = statsFor(p, per);
  const segP = (v, l) => `<button class="${per === v ? 'on' : ''}" data-a="per" data-v="${v}">${l}</button>`;
  const dfmt = d => d.toLocaleDateString('de-DE', { weekday: per === 'week' ? 'long' : undefined, day: 'numeric', month: 'long' });
  const since = per === 'all' ? 'Alle gespeicherten Spiele' : 'Seit ' + dfmt(periodStart(per));
  const tile = (l, v) => `<div class="st"><small>${l}</small><b>${v}</b></div>`;
  const q = s.legsPlayed ? Math.round(s.legs / s.legsPlayed * 100) : null;
  const quoteTile = `<div class="st wide"><small>Leg-Quote (gewonnen ÷ gespielt)</small><b>${q === null ? '–' : q + ' %'}</b>
    <div class="qbar"><i style="width:${q || 0}%"></i></div></div>`;
  const dq = s.dA ? Math.round(s.dH / s.dA * 100) : null;
  const dqTile = `<div class="st wide"><small>Checkoutquote (Double/Master Out)</small><b>${dq === null ? '–' : dq + ' %'}</b>
    <div class="qbar"><i style="width:${dq || 0}%"></i></div><small>${s.dA ? `${plural(s.dH, "Finish", "Finishes")} bei ${plural(s.dA, 'Dart', 'Darts')} auf ein mögliches Finish` : 'Noch keine Darts auf ein mögliches Finish'}</small></div>`;
  return `<div class="screen">${topBar(esc(p.name))}<div class="scroll">
    <div class="seg">${segP('week', 'Woche')}${segP('month', 'Monat')}${segP('all', 'Gesamt')}</div>
    <div class="since">${since}</div>
    <div class="sec">Legs</div><div class="stats">${tile('Gespielte Legs', s.legsPlayed)}${tile('Gewonnene Legs', s.legs)}${quoteTile}</div>
    <div class="sec">301 / 501 / 701</div>${weekChart(p)}<div class="stats">${tile('3-Dart-Ø', fmt1(s.xPts, s.xDarts, 3))}${tile('Höchste Aufnahme', s.hi || '–')}
      ${tile('Höchstes Finish', s.co || '–')}${tile('180er', s.n180)}${tile('X01-Legs', s.xLegs)}
      ${tile('Bestes 301-Leg', s.best['301'] ? s.best['301'] + ' Darts' : '–')}${tile('Bestes 501-Leg', s.best['501'] ? s.best['501'] + ' Darts' : '–')}
      ${tile('Bestes 701-Leg', s.best['701'] ? s.best['701'] + ' Darts' : '–')}${dqTile}</div>
    <div class="sec">Cricket &amp; Round the Clock</div><div class="stats">${tile('Cricket MPR', fmt1(s.crMarks, s.crRounds))}${tile('Cricket-Legs', s.crLegs)}
      ${tile('RTC bestes Leg', s.rtcBest ? s.rtcBest + ' Darts' : '–')}${tile('RTC-Legs', s.rtcLegs)}</div>
    <div class="sec">Verwalten</div>
    <button class="btn" data-a="plRename">Umbenennen</button>
    <button class="btn mt" data-a="plReset">Statistik zurücksetzen</button>
    <button class="btn red mt" data-a="plDelete">Spieler löschen</button></div></div>`;
}

function legLine(s, short) {
  const q = s.legsPlayed && !short ? ' (' + Math.round(s.legs / s.legsPlayed * 100) + ' %)' : '';
  return `${plural(s.legsPlayed, 'Leg', 'Legs')} · ${s.legs} gewonnen${q}`;
}
// ---------- Wochen-Average (X01) als Kurve ----------
function weekStart(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d; }
function isoWeek(d) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7));
  return Math.ceil(((x - Date.UTC(x.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}
const WEEKS = 12;
function weeklyAverages(p) {
  const cur = weekStart(Date.now());
  const weeks = [];
  for (let k = WEEKS - 1; k >= 0; k--) { const d = new Date(cur); d.setDate(d.getDate() - 7 * k); weeks.push({ start: d, pts: 0, darts: 0, legs: 0 }); }
  (p.log || []).filter(e => isX01(e.mode)).forEach(e => {
    const ws = weekStart(e.t).getTime(), w = weeks.find(x => x.start.getTime() === ws);
    if (w) { w.pts += e.pts; w.darts += e.darts; w.legs += e.legsPlayed || 1; }
  });
  weeks.forEach(w => { w.avg = w.darts ? w.pts / w.darts * 3 : null; w.kw = isoWeek(w.start); });
  return weeks;
}
function weekChart(p) {
  const W = weeklyAverages(p), vals = W.filter(w => w.avg !== null).map(w => w.avg);
  if (!vals.length) return `<div class="chart card"><div class="ch-t">3-Dart-Ø pro Woche</div><div class="empty" style="padding:14px 0 6px">Noch keine X01-Spiele in den letzten ${WEEKS} Wochen.</div></div>`;
  const VW = 340, VH = 170, L = 30, Rt = 14, T = 16, B = 24, iw = VW - L - Rt, ih = VH - T - B;
  // runde Achsenschritte (5/10/20/25/50), immer 4 Intervalle
  const mn = Math.min(...vals) - 2, mx = Math.max(...vals) + 2;
  const step = [5, 10, 20, 25, 50].find(st => Math.ceil(mx / st) * st - Math.floor(mn / st) * st <= 4 * st) || 50;
  const lo = Math.max(0, Math.floor(mn / step) * step), hi = lo + 4 * step;
  const x = i => L + iw * i / (WEEKS - 1), y = v => T + ih * (1 - (v - lo) / (hi - lo));
  let g = '';
  for (let k = 0; k <= 4; k++) { const v = lo + step * k; g += `<line x1="${L}" x2="${VW - Rt}" y1="${y(v)}" y2="${y(v)}" class="ch-grid"/><text x="${L - 6}" y="${y(v)}" class="ch-y">${Math.round(v)}</text>`; }
  W.forEach((w, i) => { if (i % 2 === (WEEKS - 1) % 2) g += `<text x="${x(i)}" y="${VH - 6}" class="ch-x">${w.kw}</text>`; });
  // Linie: Wochen ohne Spiele unterbrechen die Kurve nicht, sondern werden übersprungen (gestrichelt verbunden)
  const pts = W.map((w, i) => w.avg === null ? null : [x(i), y(w.avg)]);
  const real = pts.filter(Boolean);
  let solid = '', dashed = '';
  for (let i = 1; i < real.length; i++) {
    const a = real[i - 1], b = real[i], ia = pts.indexOf(a), ib = pts.indexOf(b);
    const seg = `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
    if (ib - ia === 1) solid += seg; else dashed += seg;
  }
  const lastI = W.map(w => w.avg !== null).lastIndexOf(true);
  let sel = view.wk; if (sel === undefined || W[sel].avg === null) sel = lastI;
  let dots = '', hits = '';
  W.forEach((w, i) => {
    if (w.avg === null) return;
    dots += `<circle cx="${x(i)}" cy="${y(w.avg)}" r="${i === sel ? 6 : 4.5}" class="ch-dot${i === sel ? ' sel' : ''}"/>`;
    hits += `<rect x="${x(i) - iw / (WEEKS - 1) / 2}" y="${T - 10}" width="${iw / (WEEKS - 1)}" height="${ih + 20}" fill="transparent" data-a="wk" data-i="${i}"/>`;
  });
  const sw = W[sel], lab = `<text x="${Math.min(x(sel), VW - Rt - 4)}" y="${y(sw.avg) - 12}" class="ch-lab">${sw.avg.toFixed(1)}</text>`;
  const end = new Date(sw.start); end.setDate(end.getDate() + 6);
  const fmtD = d => d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  return `<div class="chart card"><div class="ch-t">3-Dart-Ø pro Woche <span>letzte ${WEEKS} Wochen</span></div>
    <svg viewBox="0 0 ${VW} ${VH}" class="ch" role="img" aria-label="Wöchentlicher 3-Dart-Durchschnitt">${g}
      <path d="${dashed}" class="ch-line dash"/><path d="${solid}" class="ch-line"/>${dots}${lab}${hits}</svg>
    <div class="ch-info"><b>KW ${sw.kw}</b> (${fmtD(sw.start)} – ${fmtD(end)}): Ø <b>${sw.avg.toFixed(1)}</b> · ${plural(sw.legs, 'Leg', 'Legs')} · ${sw.darts} Darts</div></div>`;
}

function vRules() {
  return `<div class="screen">${topBar('Spielregeln')}<div class="scroll rules">
  <h3>301 · 501 · 701</h3>
  <p>Jeder Spieler startet mit 301, 501 oder 701 Punkten. Pro Aufnahme werden 3 Darts geworfen, die Punkte werden abgezogen. Wer zuerst <b>genau 0</b> erreicht, gewinnt das Leg.</p>
  <p><b>Check-In:</b> Bei <b>Single In</b> zählt jeder Dart sofort. Bei <b>Double In</b> beginnt die Zählung erst mit einem Double (oder Bull 50), bei <b>Master In</b> mit einem Double, Triple oder Bull 50. Der Einstiegs-Dart zählt bereits mit, Darts davor zählen 0.</p>
  <ul><li><b>Single Out:</b> Jedes Feld darf zum Abschluss treffen.</li>
  <li><b>Double Out:</b> Der letzte Dart muss ein Double oder das Bull (50) sein. Höchstes Finish: 170 (T20 · T20 · Bull).</li>
  <li><b>Master Out:</b> Der letzte Dart muss ein Double, Triple oder das Bull sein. Höchstes Finish: 180.</li></ul>
  <p><b>Bust (Überworfen):</b> Fällt der Rest unter 0, bleibt bei Double/Master Out ein Rest von 1, oder wird 0 ohne gültigen Abschluss-Dart erreicht, zählt die ganze Aufnahme nicht. Der Punktestand springt auf den Stand vor der Aufnahme zurück und der nächste Spieler ist dran.</p>
  <p>Die App zeigt ab 180 bzw. 170 Rest einen <b>Finish-Vorschlag</b> für die verbleibenden Darts.</p>
  <h3>Round the Clock</h3>
  <p>Die Felder 1 bis 20 müssen der Reihe nach getroffen werden – Single, Double und Triple zählen jeweils als Treffer. Wer zuerst alle Felder geschafft hat, gewinnt.</p>
  <ul><li><b>Bull zum Abschluss:</b> Nach der 20 muss zusätzlich das Bull (25 oder 50) getroffen werden.</li>
  <li><b>Double/Triple springen:</b> Ein Double rückt 2, ein Triple 3 Felder weiter.</li></ul>
  <h3>Cricket</h3>
  <p>Gespielt wird auf <b>15 bis 20 und Bull</b>. Ein Single zählt 1 Mark, ein Double 2, ein Triple 3. Das äußere Bull (25) zählt 1, das Bull (50) 2 Marks. Mit <b>3 Marks</b> ist eine Zahl geschlossen.</p>
  <p>Weitere Treffer auf eine geschlossene Zahl bringen Punkte (Zahlenwert, Bull = 25), solange mindestens ein Gegner diese Zahl noch nicht geschlossen hat. Hat jeder sie geschlossen, ist sie „tot“.</p>
  <p><b>Sieg:</b> Wer alle Zahlen geschlossen hat und gleich viele oder mehr Punkte als jeder Gegner hat.</p>
  <p><b>Cut Throat:</b> Punkte werden den Gegnern gutgeschrieben, die die Zahl noch offen haben. Es gewinnt, wer alles geschlossen hat und gleich viele oder weniger Punkte als jeder Gegner hat.</p>
  <h3>Legs &amp; Statistik</h3>
  <p>„First to N“: Wer zuerst N Legs gewinnt, gewinnt das Spiel. Der Anwurf wechselt mit jedem Leg.</p>
  <p><b>3-Dart-Ø</b> = erzielte Punkte ÷ geworfene Darts × 3. <b>MPR</b> = Marks pro Runde (Cricket). Statistiken werden gespeichert, sobald ein Spiel beendet ist.</p>
  <p class="muted">Bedienung: Erst Double/Triple antippen, dann die Zahl. Daneben = 0 Punkte. Mit ↶ wird der letzte Dart zurückgenommen.</p>
  </div></div>`;
}

// ---------- Spielansicht ----------
function vGame() {
  const x = isX01(G.mode);
  let h = `<div class="screen game-screen"><div class="top"><button class="ib" data-a="leave">${ICON_X}</button>
    <div class="tt"><b>${esc(modeLabel(G))}</b><small>Leg ${G.leg}${G.opts.legs > 1 ? ' · First to ' + G.opts.legs : ''}</small></div>`;
  if (x) h += `<button class="ib" data-a="toggleInput">${G.opts.input === 'sum' ? 'Darts' : 'Summe'}</button>`;
  h += `<button class="ib" data-a="undo">${ICON_UNDO}</button></div>`;
  const grid = G.mode !== 'cricket' && G.players.length > 1 ? ' grid2' : '';
  h += `<div class="board${grid}">${x ? boardX01() : G.mode === 'cricket' ? boardCr() : boardRtc()}</div>`;
  const more = G.players.length - MAX_SHOWN;
  if (more > 0) h += `<div class="more">+ ${plural(more, 'weiterer Spieler', 'weitere Spieler')}: ${shownRest()}</div>`;
  if (G.phase === 'play') h += turnBar() + keypad();
  else h += endOverlay();
  return h + '</div>';
}
// Welche Spieler oben angezeigt werden: bis 4 alle, sonst der Spieler am Zug + die 3 nächsten
const MAX_SHOWN = 4;
function shownPlayers() {
  const n = G.players.length;
  if (n <= MAX_SHOWN) return G.players.map((_, i) => i);
  return Array.from({ length: MAX_SHOWN }, (_, k) => (G.cur + k) % n);
}
function legsBadge(i) { return G.opts.legs > 1 ? `<span class="lg">${plural(G.legsWon[i], 'Leg', 'Legs')}</span>` : ''; }
function lastStr(l) {
  if (!l) return '';
  if (l.darts.length === 1 && l.darts[0].sum !== undefined) return '↳ ' + (l.bust ? '<span class="bust">BUST</span>' : l.total);
  const ds = l.darts.map(dartName).join(' ');
  if (l.total === null) return '↳ ' + ds;
  return '↳ ' + ds + ' = ' + (l.bust ? '<span class="bust">BUST</span>' : l.total);
}
function boardX01() {
  return shownPlayers().map(i => {
    const pl = G.players[i], p = G.ps[i], st = G.stats[i], cur = i === G.cur && G.phase === 'play';
    return `<div class="pc ${cur ? 'cur' : ''}"><div class="pc-name">${esc(pl.name)}${legsBadge(i)}</div>
      <div class="pc-score">${p.score}</div>
      <div class="pc-sub">Ø ${fmt1(st.pts, st.darts, 3)}<br>${p.darts} Darts${p.in === false ? '<br><span class="inwait">nicht eingestiegen</span>' : ''}</div>
      <div class="pc-last">${lastStr(p.last)}</div></div>`;
  }).join('');
}
function markSvg(m) {
  if (!m) return '';
  let s = `<svg viewBox="0 0 30 30" class="mk ${m >= 3 ? 'c' : ''}"><line x1="8" y1="22" x2="22" y2="8"/>`;
  if (m >= 2) s += '<line x1="8" y1="8" x2="22" y2="22"/>';
  if (m >= 3) s += '<circle cx="15" cy="15" r="12"/>';
  return s + '</svg>';
}
function boardCr() {
  const cur = G.phase === 'play' ? G.cur : -1, vis = shownPlayers();
  let h = `<div class="crw"><table class="cr"><thead><tr><th></th>`;
  vis.forEach(i => { const pl = G.players[i]; h += `<th class="${i === cur ? 'cur' : ''}">${esc(pl.name)}<span class="pts">${G.ps[i].pts}</span>${G.opts.legs > 1 ? `<small class="muted">${plural(G.legsWon[i], 'Leg', 'Legs')}</small>` : ''}</th>`; });
  h += `</tr></thead><tbody>`;
  CR_NUMS.forEach(n => {
    const dead = G.ps.every(p => p.marks[n] >= 3);
    h += `<tr class="${dead ? 'dead' : ''}"><td class="num">${n === 25 ? 'Bull' : n}</td>`;
    vis.forEach(i => { h += `<td class="${i === cur ? 'cur' : ''}">${markSvg(G.ps[i].marks[n])}</td>`; });
    h += '</tr>';
  });
  const st = G.stats;
  h += `<tr><td class="num" style="font-size:13px">MPR</td>${vis.map(i => `<td class="${i === cur ? 'cur' : ''} muted">${fmt1(st[i].marks, st[i].rounds)}</td>`).join('')}</tr>`;
  return h + '</tbody></table></div>';
}
function boardRtc() {
  const T = rtcTargets(G.opts);
  return shownPlayers().map(i => {
    const pl = G.players[i], p = G.ps[i], cur = i === G.cur && G.phase === 'play';
    const t = p.idx >= T.length ? '✓' : T[p.idx] === 25 ? 'Bull' : T[p.idx];
    return `<div class="pc ${cur ? 'cur' : ''}"><div class="pc-name">${esc(pl.name)}${legsBadge(i)}</div>
      <div class="pc-score">${t}</div>
      <div class="pc-sub">${p.idx}/${T.length} Felder<br>${p.darts} Darts</div>
      <div class="pc-last"><div class="prog"><i style="width:${p.idx / T.length * 100}%"></i></div></div></div>`;
  }).join('');
}
function shownRest() {
  const vis = shownPlayers();
  return G.players.map((p, i) => i).filter(i => !vis.includes(i))
    .sort((a, b) => ((a - G.cur + G.players.length) % G.players.length) - ((b - G.cur + G.players.length) % G.players.length))
    .map(i => esc(G.players[i].name) + (isX01(G.mode) ? ' ' + G.ps[i].score : '')).join(' · ');
}
function inHint() { return G.opts.in === 'master' ? 'Einstieg: Double/Triple nötig' : 'Einstieg: Double nötig'; }
function turnBar() {
  const name = esc(G.players[G.cur].name);
  const p = G.ps[G.cur];
  if (isX01(G.mode) && G.opts.input === 'sum') {
    const co = p.in !== false && p.score <= 180 ? checkout(p.score, 3, G.opts.out) : null;
    return `<div class="turn"><div class="who"><b>${name}</b><small>${p.in === false ? inHint() + ' – nur zählende Punkte eingeben' : co ? 'Finish: ' + co.map(dartName).join(' · ') : 'Rest ' + p.score}</small></div>
      <div class="sumdisp ${sumBuf ? '' : 'ph'}">${sumBuf || 'Punkte eingeben'}</div></div>`;
  }
  const slots = [0, 1, 2].map(k => { const d = G.turn[k]; return `<div class="slot ${d ? 'f' : ''}">${d ? dartName(d) : ''}</div>`; }).join('');
  let info = '';
  if (isX01(G.mode)) {
    const co = p.in !== false ? checkout(p.score, 3 - G.turn.length, G.opts.out) : null;
    info = p.in === false ? inHint() : co ? 'Finish: ' + co.map(dartName).join(' · ') : '';
    const tot = p.ts - p.score;   // nur zählende Punkte (wichtig bei Double/Master In)
    return `<div class="turn"><div class="who"><b>${name}</b><small>${info}</small></div>${slots}<div class="tot">${tot}</div></div>`;
  }
  if (G.mode === 'rtc') { const T = rtcTargets(G.opts); info = 'Ziel: ' + (T[p.idx] === 25 ? 'Bull' : T[p.idx]); }
  else info = 'Punkte: ' + p.pts;
  return `<div class="turn"><div class="who"><b>${name}</b><small>${info}</small></div>${slots}</div>`;
}
function keypad() {
  const und = `<button class="k und" data-a="undo">${ICON_UNDO}</button>`;
  const mods = (span) => `<button class="k mod d ${mod === 2 ? 'on' : ''} ${span}" data-a="mod" data-m="2">Double</button>
    <button class="k mod t ${mod === 3 ? 'on' : ''} ${span}" data-a="mod" data-m="3">Triple</button>`;
  const pre = mod === 3 ? 'T' : mod === 2 ? 'D' : '';
  if (isX01(G.mode) && G.opts.input === 'sum') {
    let h = '<div class="kp kp3">';
    [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(d => { h += `<button class="k" data-a="digit" data-d="${d}">${d}</button>`; });
    h += `<button class="k und" data-a="del">⌫</button><button class="k" data-a="digit" data-d="0">0</button><button class="k ok" data-a="sumOk">OK</button>`;
    return h + '</div>';
  }
  if (G.mode === 'rtc') {
    const T = rtcTargets(G.opts), t = T[G.ps[G.cur].idx];
    if (t === 25 || !G.opts.rtcSkip) {
      return `<div class="kp kp2" style="grid-template-rows:1fr 64px"><button class="k tall ok" data-a="rtc" data-m="${t === 25 ? 1 : 1}">Treffer<small>${t === 25 ? '25 oder Bull' : 'Feld ' + t}</small></button>
        <button class="k tall miss" data-a="rtc" data-m="0">Daneben</button><button class="k s2 und" data-a="undo">${ICON_UNDO} Rückgängig</button></div>`;
    }
    return `<div class="kp kp2" style="grid-template-rows:1fr 1fr 64px"><button class="k tall" data-a="rtc" data-m="1">Single ${t}</button><button class="k tall" data-a="rtc" data-m="2">Double ${t}</button>
      <button class="k tall" data-a="rtc" data-m="3">Triple ${t}</button><button class="k tall miss" data-a="rtc" data-m="0">Daneben</button>
      <button class="k s2 und" data-a="undo">${ICON_UNDO} Rückgängig</button></div>`;
  }
  if (G.mode === 'cricket') {
    let h = `<div class="kp kp4">${mods('s2')}`;
    [20, 19, 18, 17, 16, 15].forEach(n => { h += `<button class="k tall" data-a="dart" data-n="${n}">${pre}${n}</button>`; });
    h += `<button class="k tall bull" data-a="dart" data-n="25" data-m="1" ${mod === 3 ? 'disabled' : ''}>25</button>
      <button class="k tall bull2" data-a="dart" data-n="25" data-m="2" ${mod === 3 ? 'disabled' : ''}>Bull</button>
      <button class="k s3 miss" data-a="dart" data-n="0">Daneben</button>${und}</div>`;
    return h;
  }
  let h = `<div class="kp kp4 x01">${mods('s2')}`;
  for (let n = 1; n <= 20; n++) h += `<button class="k" data-a="dart" data-n="${n}">${pre}${n}</button>`;
  h += `<button class="k bull" data-a="dart" data-n="25" data-m="1" ${mod === 3 ? 'disabled' : ''}>25</button>
    <button class="k bull2" data-a="dart" data-n="25" data-m="2" ${mod === 3 ? 'disabled' : ''}>Bull</button>
    <button class="k miss" data-a="dart" data-n="0">0</button>${und}</div>`;
  return h;
}
function endOverlay() {
  const w = G.legWinner, match = G.phase === 'matchEnd';
  const x = isX01(G.mode), cr = G.mode === 'cricket';
  let head = '<tr><th>Spieler</th><th>Legs</th>' + (x ? '<th>Ø</th><th>Höchste</th><th>Finish</th>' : cr ? '<th>Punkte</th><th>MPR</th>' : '<th>Darts</th>') + '</tr>';
  let rows = G.players.map((pl, i) => {
    const st = G.stats[i];
    let r = `<tr class="${i === w ? 'w' : ''}"><td>${esc(pl.name)}</td><td>${G.legsWon[i]}</td>`;
    if (x) r += `<td>${fmt1(st.pts, st.darts, 3)}</td><td>${st.hi || '–'}</td><td>${st.co || '–'}</td>`;
    else if (cr) r += `<td>${G.ps[i].pts}</td><td>${fmt1(st.marks, st.rounds)}</td>`;
    else r += `<td>${G.ps[i].darts}</td>`;
    return r + '</tr>';
  }).join('');
  const sub = x && G.ps[w].last ? `Checkout ${G.ps[w].last.total} mit ${G.ps[w].darts} Darts` : `${G.ps[w].darts} Darts im Leg`;
  return `<div class="ov"><div class="ovb"><div class="tr">${match ? '🏆' : '🎯'}</div>
    <h2>${esc(G.players[w].name)} ${match ? (G.players.length > 1 ? 'gewinnt das Spiel!' : 'ist fertig!') : 'gewinnt Leg ' + G.leg}</h2><p>${sub}</p>
    <table class="sum">${head}${rows}</table>
    ${match ? `<button class="btn gold" data-a="rematch">Revanche</button><button class="btn pri" data-a="finish">Fertig</button>`
            : `<button class="btn pri" data-a="nextLeg">Nächstes Leg</button><button class="btn" data-a="finish">Spiel beenden</button>`}
    <button class="btn ghost" data-a="undo">Letzten Dart rückgängig</button></div></div>`;
}

// ================= Modal / Toast / Flash =================
let modalBtns = [], modalId = 0;
function modal(title, body, btns, vertical) {
  modalBtns = btns; modalId++;
  const m = $('#modal');
  m.innerHTML = `<div class="mbox"><h3>${title}</h3><div class="mbody">${body}</div>
    <div class="mbtns ${vertical ? '' : 'h'}">${btns.map((b, i) => `<button class="btn ${b.cls || ''}" data-a="mbtn" data-i="${i}">${b.label}</button>`).join('')}</div></div>`;
  m.hidden = false;
  const inp = m.querySelector('input');
  if (inp) { setTimeout(() => { inp.focus(); inp.select(); }, 60); inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); pressModal(btns.findIndex(b => b.cls && b.cls.includes('pri'))); } }); }
}
function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; modalBtns = []; }
function pressModal(i) {
  const b = modalBtns[i]; if (!b) return;
  const id = modalId;
  const r = b.fn ? b.fn() : undefined;
  if (r !== false && id === modalId) closeModal();
}
function confirmBox(title, text, okLabel, fn, danger) {
  modal(title, text, [{ label: 'Abbrechen', cls: 'ghost' }, { label: okLabel, cls: danger ? 'red' : 'pri', fn }]);
}
function namePrompt(title, val, fn) {
  modal(title, `<input id="mIn" maxlength="20" value="${esc(val)}" placeholder="Name" autocomplete="off">`,
    [{ label: 'Abbrechen', cls: 'ghost' }, { label: 'Speichern', cls: 'pri', fn: () => {
      const n = $('#mIn').value.trim().replace(/\s+/g, ' ');
      if (!n) { toast('Bitte einen Namen eingeben'); return false; }
      return fn(n);
    } }]);
}
let toastT;
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('on'), 2000); }
let flashT;
function flash(big, small, bad) {
  const f = $('#flash');
  f.innerHTML = `<b class="${bad ? 'bust' : ''}">${big}</b>${small ? `<small>${small}</small>` : ''}`;
  f.classList.add('on'); clearTimeout(flashT); flashT = setTimeout(() => f.classList.remove('on'), 1100);
}

// ================= Aktionen =================
function nameTaken(n, exceptId) { return DB.players.some(p => p.id !== exceptId && p.name.toLowerCase() === n.toLowerCase()); }

const ACT = {
  back, go: d => go(d.v, { id: d.id }),
  mbtn: d => pressModal(+d.i),
  per: d => { view.per = d.v; render(); },
  wk: d => { view.wk = +d.i; render(); },
  resume: () => { G = DB.current.G; hist = DB.current.hist || []; mod = 1; sumBuf = ''; go('game'); },
  discard: () => confirmBox('Spiel verwerfen?', 'Das laufende Spiel wird gelöscht. Bereits beendete Legs bleiben in der Statistik.', 'Verwerfen', () => { DB.current = null; persist(); render(); }, true),
  set: d => { DB.settings[d.k] = d.v; persist(); render(); },
  tog: d => { DB.settings[d.k] = !DB.settings[d.k]; persist(); render(); },
  legs: d => { DB.settings.legs = Math.max(1, Math.min(11, DB.settings.legs + +d.d)); persist(); render(); },
  sel: d => { const s = selectedIds(), k = s.indexOf(d.id); if (k >= 0) s.splice(k, 1); else s.push(d.id); persist(); render(); },
  shuffle: () => { const s = selectedIds(); for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; } persist(); render(); },
  addPl: d => namePrompt('Neuer Spieler', '', n => {
    if (nameTaken(n)) { toast('Name existiert schon'); return false; }
    const p = { id: uid(), name: n, stats: newStats() };
    DB.players.push(p);
    if (d.sel || view.v === 'setup') selectedIds().push(p.id);
    persist(); render();
  }),
  plRename: () => { const p = DB.players.find(x => x.id === view.id); namePrompt('Umbenennen', p.name, n => {
    if (nameTaken(n, p.id)) { toast('Name existiert schon'); return false; }
    p.name = n; persist(); render(); }); },
  plReset: () => { const p = DB.players.find(x => x.id === view.id); confirmBox('Statistik zurücksetzen?', `Alle Statistiken von <b>${esc(p.name)}</b> werden auf 0 gesetzt.`, 'Zurücksetzen', () => { p.stats = newStats(); p.log = []; persist(); render(); }, true); },
  plDelete: () => { const p = DB.players.find(x => x.id === view.id); confirmBox('Spieler löschen?', `<b>${esc(p.name)}</b> und die Statistik werden endgültig gelöscht.`, 'Löschen', () => { DB.players = DB.players.filter(x => x.id !== p.id); persist(); back(); }, true); },
  start: () => {
    const ids = selectedIds(); if (!ids.length) return;
    const go2 = () => {
      G = newGame(ids.map(id => DB.players.find(p => p.id === id)), DB.settings);
      hist = []; mod = 1; sumBuf = ''; saveGame();
      stack = [{ v: 'home' }]; view = { v: 'game' }; render(true);
    };
    if (DB.current) confirmBox('Laufendes Spiel ersetzen?', 'Es gibt noch ein unterbrochenes Spiel. Es wird verworfen.', 'Neues Spiel', go2, true);
    else go2();
  },
  // Spiel
  mod: d => { const m = +d.m; mod = mod === m ? 1 : m; render(); },
  dart: d => {
    const n = +d.n;
    let m = d.m ? +d.m : (n === 0 ? 1 : mod);
    if (n === 25 && m === 3) return;
    throwDart(n, m);
  },
  rtc: d => throwDart(0, +d.m),
  digit: d => { const s = (sumBuf === '0' ? '' : sumBuf) + d.d; if (+s <= 180) { sumBuf = s; render(); } else toast('Maximal 180'); },
  del: () => { sumBuf = sumBuf.slice(0, -1); render(); },
  sumOk: enterTotal,
  undo,
  toggleInput: () => {
    if (G.turn.length) return toast('Erst die Aufnahme beenden');
    G.opts.input = G.opts.input === 'sum' ? 'darts' : 'sum'; DB.settings.input = G.opts.input;
    sumBuf = ''; mod = 1; saveGame(); render();
  },
  nextLeg,
  finish: () => { endGame(); G = null; hist = []; home(); },
  rematch: () => {
    endGame();
    const pl = G.players.slice(); pl.push(pl.shift());   // gleiche Drehung wie beim Leg-Wechsel
    G = newGame(pl, { mode: G.mode, ...G.opts }); hist = []; mod = 1; sumBuf = '';
    saveGame(); render(true); toast('Neues Spiel!');
  },
  leave: () => {
    if (G.phase === 'matchEnd') {
      modal('Spiel beendet', 'Zurück zum Menü?', [{ label: 'Zurück', cls: 'ghost' }, { label: 'Zum Menü', cls: 'pri', fn: ACT.finish }]);
      return;
    }
    modal('Spiel verlassen?', 'Du kannst das Spiel pausieren und später im Startmenü fortsetzen. Beendete Legs sind bereits in der Statistik gespeichert.', [
      { label: 'Pausieren', cls: 'pri', fn: () => { saveGame(); G = null; home(); } },
      { label: 'Spiel abbrechen', cls: 'red', fn: () => { DB.current = null; persist(); G = null; home(); } },
      { label: 'Weiterspielen', cls: 'ghost' }], true);
  }
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const f = ACT[el.dataset.a];
  if (f) f(el.dataset, el);
});

window.appBack = function () {
  if (!$('#modal').hidden) { closeModal(); return true; }
  if (view.v === 'home') return false;
  if (view.v === 'game') { ACT.leave(); return true; }
  back(); return true;
};

if (window._dzMigrate) { migrateLegs(window._dzMigrate); delete window._dzMigrate; }
render(true);
