(function () {
'use strict';
/*
 * Mesin catur + AI (satu sumber untuk papan di sheet WhatsApp DAN verifikasi di bot).
 * Deterministik: AI memakai pencarian berkedalaman tetap + batas node (bukan batas waktu) + RNG ber-seed,
 * jadi bot bisa memutar ulang seluruh permainan dari kode klaim dan memastikan tiap langkah AI memang sama.
 * Papan: array 64, indeks = rank*8 + file (rank 0 = baris 1). Putih = +1..+6 (P N B R Q K), hitam = negatif.
 */
var P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
var KN = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
var KG = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
var BD = [[1, 1], [1, -1], [-1, 1], [-1, -1]], RD = [[1, 0], [-1, 0], [0, 1], [0, -1]];
var PROMO = [Q, R, B, N];
var VAL = [0, 100, 320, 330, 500, 900, 0];
var MATE = 30000, INF = 1e9;

function rng(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function newGame() {
  var b = new Array(64).fill(0), back = [R, N, B, Q, K, B, N, R];
  for (var f = 0; f < 8; f++) { b[f] = back[f]; b[8 + f] = P; b[48 + f] = -P; b[56 + f] = -back[f]; }
  return { b: b, t: 1, c: 15, ep: -1, half: 0, full: 1, k: [4, 60] };
}

// FEN → state (dipakai untuk pengujian)
function fromFen(fen) {
  var p = fen.trim().split(/\s+/), b = new Array(64).fill(0), k = [4, 60];
  var map = { p: P, n: N, b: B, r: R, q: Q, k: K };
  p[0].split('/').forEach(function (row, i) {
    var f = 0;
    for (var j = 0; j < row.length; j++) {
      var ch = row[j];
      if (/\d/.test(ch)) f += +ch;
      else {
        var sq = (7 - i) * 8 + f++, v = map[ch.toLowerCase()] * (ch === ch.toUpperCase() ? 1 : -1);
        b[sq] = v;
        if (v === K) k[0] = sq; if (v === -K) k[1] = sq;
      }
    }
  });
  var c = 0, cs = p[2] || '-';
  if (cs.indexOf('K') >= 0) c |= 1; if (cs.indexOf('Q') >= 0) c |= 2; if (cs.indexOf('k') >= 0) c |= 4; if (cs.indexOf('q') >= 0) c |= 8;
  var ep = !p[3] || p[3] === '-' ? -1 : p[3].charCodeAt(0) - 97 + (+p[3][1] - 1) * 8;
  return { b: b, t: (p[1] || 'w') === 'w' ? 1 : -1, c: c, ep: ep, half: +(p[4] || 0), full: +(p[5] || 1), k: k };
}

function attacked(b, sq, by) {
  var f = sq & 7, r = sq >> 3, i, nf, nr, p;
  var pr = r - by;
  if (pr >= 0 && pr < 8) {
    if (f > 0 && b[pr * 8 + f - 1] === by * P) return true;
    if (f < 7 && b[pr * 8 + f + 1] === by * P) return true;
  }
  for (i = 0; i < 8; i++) {
    nf = f + KN[i][0]; nr = r + KN[i][1];
    if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8 && b[nr * 8 + nf] === by * N) return true;
  }
  for (i = 0; i < 8; i++) {
    nf = f + KG[i][0]; nr = r + KG[i][1];
    if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8 && b[nr * 8 + nf] === by * K) return true;
  }
  for (i = 0; i < 4; i++) {
    nf = f + BD[i][0]; nr = r + BD[i][1];
    while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
      p = b[nr * 8 + nf];
      if (p) { if (p === by * B || p === by * Q) return true; break; }
      nf += BD[i][0]; nr += BD[i][1];
    }
    nf = f + RD[i][0]; nr = r + RD[i][1];
    while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
      p = b[nr * 8 + nf];
      if (p) { if (p === by * R || p === by * Q) return true; break; }
      nf += RD[i][0]; nr += RD[i][1];
    }
  }
  return false;
}

function inCheck(s) { return attacked(s.b, s.k[s.t === 1 ? 0 : 1], -s.t); }

function pseudo(s) {
  var b = s.b, t = s.t, out = [], sq, p, a, f, r, i, d, nf, nr, to, tp;
  function add(from, to2, piece, cap, pr, fl) { out.push({ f: from, t: to2, p: piece, c: cap, pr: pr || 0, fl: fl || 0 }); }
  for (sq = 0; sq < 64; sq++) {
    p = b[sq];
    if (!p || (p > 0) !== (t > 0)) continue;
    a = p * t; f = sq & 7; r = sq >> 3;
    if (a === P) {
      var one = sq + t * 8, last = t === 1 ? 7 : 0, start = t === 1 ? 1 : 6;
      if (b[one] === 0) {
        if ((one >> 3) === last) for (i = 0; i < 4; i++) add(sq, one, p, 0, PROMO[i], 0);
        else {
          add(sq, one, p, 0, 0, 0);
          if (r === start && b[one + t * 8] === 0) add(sq, one + t * 8, p, 0, 0, 1);
        }
      }
      for (d = -1; d <= 1; d += 2) {
        nf = f + d;
        if (nf < 0 || nf > 7) continue;
        to = one + d; tp = b[to];
        if (tp && (tp > 0) !== (t > 0)) {
          if ((to >> 3) === last) for (i = 0; i < 4; i++) add(sq, to, p, tp, PROMO[i], 0);
          else add(sq, to, p, tp, 0, 0);
        } else if (!tp && to === s.ep) add(sq, to, p, -t * P, 0, 2);
      }
    } else if (a === N || a === K) {
      var dirs = a === N ? KN : KG;
      for (i = 0; i < 8; i++) {
        nf = f + dirs[i][0]; nr = r + dirs[i][1];
        if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
        to = nr * 8 + nf; tp = b[to];
        if (!tp || (tp > 0) !== (t > 0)) add(sq, to, p, tp, 0, 0);
      }
      if (a === K) {
        var home = t === 1 ? 4 : 60, rook = R * t;
        if (sq === home && !attacked(b, home, -t)) {
          if ((s.c & (t === 1 ? 1 : 4)) && !b[home + 1] && !b[home + 2] && b[home + 3] === rook && !attacked(b, home + 1, -t) && !attacked(b, home + 2, -t)) add(sq, home + 2, p, 0, 0, 3);
          if ((s.c & (t === 1 ? 2 : 8)) && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === rook && !attacked(b, home - 1, -t) && !attacked(b, home - 2, -t)) add(sq, home - 2, p, 0, 0, 4);
        }
      }
    } else {
      var rays = a === B ? BD : a === R ? RD : BD.concat(RD);
      for (i = 0; i < rays.length; i++) {
        nf = f + rays[i][0]; nr = r + rays[i][1];
        while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
          to = nr * 8 + nf; tp = b[to];
          if (!tp) add(sq, to, p, 0, 0, 0);
          else { if ((tp > 0) !== (t > 0)) add(sq, to, p, tp, 0, 0); break; }
          nf += rays[i][0]; nr += rays[i][1];
        }
      }
    }
  }
  return out;
}

function make(s, m) {
  var b = s.b.slice(), t = s.t, p = m.p, c = s.c, k = s.k.slice();
  b[m.f] = 0;
  b[m.t] = m.pr ? t * m.pr : p;
  if (m.fl === 2) b[m.t - 8 * t] = 0;
  if (m.fl === 3) { b[m.t - 1] = b[m.t + 1]; b[m.t + 1] = 0; }
  if (m.fl === 4) { b[m.t + 1] = b[m.t - 2]; b[m.t - 2] = 0; }
  if (p === K) { c &= 12; k[0] = m.t; }
  if (p === -K) { c &= 3; k[1] = m.t; }
  if (m.f === 0 || m.t === 0) c &= ~2;
  if (m.f === 7 || m.t === 7) c &= ~1;
  if (m.f === 56 || m.t === 56) c &= ~8;
  if (m.f === 63 || m.t === 63) c &= ~4;
  return { b: b, t: -t, c: c, ep: m.fl === 1 ? (m.f + m.t) / 2 : -1, half: (p === P || p === -P || m.c) ? 0 : s.half + 1, full: s.full + (t === -1 ? 1 : 0), k: k };
}

function legal(s) {
  var ks = s.t === 1 ? 0 : 1;
  return pseudo(s).filter(function (m) {
    var n = make(s, m);
    return !attacked(n.b, n.k[ks], -s.t);
  });
}

function keyOf(s) {
  var o = '';
  for (var i = 0; i < 64; i++) o += String.fromCharCode(70 + s.b[i]);
  return o + s.t + s.c + s.ep;
}

function insufficient(b) {
  var rest = [], i;
  for (i = 0; i < 64; i++) if (b[i] && Math.abs(b[i]) !== K) rest.push([b[i], i]);
  if (!rest.length) return true;
  if (rest.length === 1 && (Math.abs(rest[0][0]) === N || Math.abs(rest[0][0]) === B)) return true;
  if (rest.length === 2 && Math.abs(rest[0][0]) === B && Math.abs(rest[1][0]) === B) {
    var sh = function (x) { return ((x[1] >> 3) + (x[1] & 7)) % 2; };
    return sh(rest[0]) === sh(rest[1]);
  }
  return false;
}

// { over, res: 'mate'|'stalemate'|'material'|'fifty'|'repetition', winner: 1|-1|0, check }
function status(s, keys, mv) {
  mv = mv || legal(s);
  var chk = inCheck(s);
  if (!mv.length) return chk ? { over: 1, res: 'mate', winner: -s.t, check: 1 } : { over: 1, res: 'stalemate', winner: 0, check: 0 };
  if (insufficient(s.b)) return { over: 1, res: 'material', winner: 0, check: chk };
  if (s.half >= 100) return { over: 1, res: 'fifty', winner: 0, check: chk };
  if (keys) {
    var k = keyOf(s), n = 0;
    for (var i = 0; i < keys.length; i++) if (keys[i] === k) n++;
    if (n >= 3) return { over: 1, res: 'repetition', winner: 0, check: chk };
  }
  return { over: 0, check: chk };
}

/* ── notasi (hanya untuk tampilan) ── */
var FILES = 'abcdefgh', LET = ['', '', 'N', 'B', 'R', 'Q', 'K'];
function sqName(i) { return FILES[i & 7] + ((i >> 3) + 1); }
function san(s, m, mv) {
  mv = mv || legal(s);
  var o;
  if (m.fl === 3) o = 'O-O';
  else if (m.fl === 4) o = 'O-O-O';
  else {
    var a = Math.abs(m.p);
    o = '';
    if (a !== P) {
      o += LET[a];
      var riv = mv.filter(function (x) { return x.p === m.p && x.t === m.t && x.f !== m.f; });
      if (riv.length) {
        if (!riv.some(function (x) { return (x.f & 7) === (m.f & 7); })) o += FILES[m.f & 7];
        else if (!riv.some(function (x) { return (x.f >> 3) === (m.f >> 3); })) o += (m.f >> 3) + 1;
        else o += sqName(m.f);
      }
    } else if (m.c) o += FILES[m.f & 7];
    if (m.c) o += 'x';
    o += sqName(m.t);
    if (m.pr) o += '=' + LET[m.pr];
  }
  var n = make(s, m), st = status(n);
  return o + (st.res === 'mate' ? '#' : st.check ? '+' : '');
}

/* ── evaluasi & pencarian ── */
var PST = {
  1: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, -20, -20, 10, 10, 5, 5, -5, -10, 0, 0, -10, -5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, 5, 10, 25, 25, 10, 5, 5, 10, 10, 20, 30, 30, 20, 10, 10, 50, 50, 50, 50, 50, 50, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0],
  2: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 5, 5, 0, -20, -40, -30, 5, 10, 15, 15, 10, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 10, 15, 15, 10, 0, -30, -40, -20, 0, 0, 0, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  3: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 5, 0, 0, 0, 0, 5, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 0, 0, 0, 0, 0, 0, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  4: [0, 0, 0, 5, 5, 0, 0, 0, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 5, 10, 10, 10, 10, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  5: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 5, 0, 0, 0, 0, -10, -10, 5, 5, 5, 5, 5, 0, -10, 0, 0, 5, 5, 5, 5, 0, -5, -5, 0, 5, 5, 5, 5, 0, -5, -10, 0, 5, 5, 5, 5, 0, -10, -10, 0, 0, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  6: [20, 30, 10, 0, 0, 10, 30, 20, 20, 20, 0, 0, 0, 0, 20, 20, -10, -20, -20, -20, -20, -20, -20, -10, -20, -30, -30, -40, -40, -30, -30, -20, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30]
};
function evalPos(s) {
  var sc = 0, b = s.b;
  for (var i = 0; i < 64; i++) {
    var p = b[i];
    if (!p) continue;
    var a = p > 0 ? p : -p, v = VAL[a] + PST[a][p > 0 ? i : i ^ 56];
    sc += p > 0 ? v : -v;
  }
  return s.t === 1 ? sc : -sc;
}

var nodes = 0, limit = 0, aborted = false;

function order(mv, first) {
  var sc = mv.map(function (m, i) {
    var v = 0;
    if (m.c) v += 10 * VAL[Math.abs(m.c)] - VAL[Math.abs(m.p)] / 10;
    if (m.pr) v += VAL[m.pr];
    if (first && m.f === first.f && m.t === first.t && m.pr === first.pr) v += 100000;
    return [v, i, m];
  });
  sc.sort(function (a, b) { return b[0] - a[0] || a[1] - b[1]; });
  return sc.map(function (x) { return x[2]; });
}

function qsearch(s, alpha, beta, qd) {
  nodes++;
  if (nodes > limit) { aborted = true; return 0; }
  var stand = evalPos(s);
  if (stand >= beta) return stand;
  if (qd <= 0) return stand;
  if (stand > alpha) alpha = stand;
  var mv = order(legal(s).filter(function (m) { return m.c || m.pr; }));
  for (var i = 0; i < mv.length; i++) {
    var v = -qsearch(make(s, mv[i]), -beta, -alpha, qd - 1);
    if (aborted) return 0;
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function search(s, depth, alpha, beta, ply, qs) {
  nodes++;
  if (nodes > limit) { aborted = true; return 0; }
  var mv = legal(s);
  if (!mv.length) return inCheck(s) ? -MATE + ply : 0;
  if (depth <= 0) return qs ? qsearch(s, alpha, beta, 4) : evalPos(s);
  mv = order(mv);
  var best = -INF;
  for (var i = 0; i < mv.length; i++) {
    var v = -search(make(s, mv[i]), depth - 1, -beta, -alpha, ply + 1, qs);
    if (aborted) return 0;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

/*
 * Tingkat kesulitan 1–8: [nama, kedalaman, quiescence, derau evaluasi (cp), batas node, acak murni]
 * Derau & pemilihan memakai rng ber-seed → hasil selalu sama untuk seed + posisi yang sama.
 */
var LEVELS = [
  null,
  { name: 'Newbie', depth: 0, qs: 0, noise: 0, nodes: 0, random: 1 },
  { name: 'Beginner', depth: 1, qs: 0, noise: 160, nodes: 4000 },
  { name: 'Casual', depth: 2, qs: 0, noise: 90, nodes: 12000 },
  { name: 'Club', depth: 2, qs: 1, noise: 45, nodes: 20000 },
  { name: 'Advanced', depth: 3, qs: 0, noise: 22, nodes: 30000 },
  { name: 'Expert', depth: 3, qs: 1, noise: 8, nodes: 40000 },
  { name: 'Master', depth: 4, qs: 1, noise: 3, nodes: 45000 },
  { name: 'Grandmaster', depth: 5, qs: 1, noise: 0, nodes: 60000 }
];

// Pilih langkah AI. rnd = fungsi acak ber-seed (dipakai berurutan, jadi harus sama persis antara papan & bot).
function aiMove(s, level, rnd, mv) {
  mv = mv || legal(s);
  var L = LEVELS[Math.max(1, Math.min(8, level | 0))];
  if (mv.length === 1) { rnd(); return mv[0]; }
  if (L.random) return mv[Math.floor(rnd() * mv.length)];
  var scored = null, prevBest = null;
  limit = L.nodes; nodes = 0; aborted = false;
  for (var d = 1; d <= L.depth; d++) {
    var cur = [], list = order(mv, prevBest), alpha = -INF, bad = false;
    for (var i = 0; i < list.length; i++) {
      var exact = L.noise > 0;
      var v = -search(make(s, list[i]), d - 1, exact ? -INF : -INF, exact ? INF : -alpha, 1, L.qs);
      if (aborted) { bad = true; break; }
      cur.push([list[i], v]);
      if (v > alpha) alpha = v;
    }
    if (bad) break;
    scored = cur;
    var top = cur[0];
    for (var j = 1; j < cur.length; j++) if (cur[j][1] > top[1]) top = cur[j];
    prevBest = top[0];
  }
  if (!scored) scored = mv.map(function (m) { return [m, 0]; }); // anggaran node habis di kedalaman 1
  var best = null, bs = -INF;
  for (var k = 0; k < scored.length; k++) {
    var sc = scored[k][1] + (L.noise ? Math.floor((rnd() * 2 - 1) * L.noise) : 0);
    if (sc > bs) { bs = sc; best = scored[k][0]; }
  }
  return best;
}

/* ── kode langkah pemain: dari | ke<<6 | promosi<<12 (0=Q 1=R 2=B 3=N) ── */
function encode(m) { return m.f | (m.t << 6) | ((m.pr ? PROMO.indexOf(m.pr) : 0) << 12); }
function decode(mv, code) {
  var f = code & 63, t = (code >> 6) & 63, pr = PROMO[(code >> 12) & 3];
  for (var i = 0; i < mv.length; i++) {
    var m = mv[i];
    if (m.f === f && m.t === t && (!m.pr || m.pr === pr)) return m;
  }
  return null;
}

/*
 * Putar ulang permainan: cfg = { seed, level, side (1 putih / -1 hitam — sisi PEMAIN) }, codes = langkah pemain.
 * → { ok, over, win, loss, draw, res, plies, moves }
 */
function replay(cfg, codes) {
  var s = newGame(), keys = [keyOf(s)], rnd = rng(cfg.seed >>> 0), i = 0, plies = 0, st, mv, m;
  for (;;) {
    mv = legal(s); st = status(s, keys, mv);
    if (st.over) break;
    if (s.t === cfg.side) {
      if (i >= codes.length) return { ok: true, over: false, plies: plies, moves: i };
      m = decode(mv, codes[i++]);
      if (!m) return { ok: false, error: 'illegal' };
    } else m = aiMove(s, cfg.level, rnd, mv);
    s = make(s, m); keys.push(keyOf(s)); plies++;
    if (plies > 600) return { ok: false, error: 'too long' };
  }
  if (i !== codes.length) return { ok: false, error: 'extra' };
  return { ok: true, over: true, res: st.res, win: st.winner === cfg.side, loss: st.winner === -cfg.side, draw: st.winner === 0, plies: plies, moves: i };
}

function perft(s, d) {
  if (d === 0) return 1;
  var mv = legal(s), n = 0;
  if (d === 1) return mv.length;
  for (var i = 0; i < mv.length; i++) n += perft(make(s, mv[i]), d - 1);
  return n;
}

return { newGame: newGame, fromFen: fromFen, legal: legal, make: make, status: status, inCheck: inCheck, san: san, keyOf: keyOf, aiMove: aiMove, rng: rng, encode: encode, decode: decode, replay: replay, perft: perft, LEVELS: LEVELS, PROMO: PROMO };
})()
