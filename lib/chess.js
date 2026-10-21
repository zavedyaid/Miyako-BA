/*
 * Mesin catur (aturan lengkap): rokade, en passant, promosi, skakmat, pat, remis (50 langkah, materi tak cukup, 3x posisi sama).
 * Papan: array 64, indeks = baris*8 + kolom, baris 0 = rank 1. Bidak: huruf besar = putih (PNBRQK), huruf kecil = hitam.
 * State bersifat immutable — apply() mengembalikan state baru.
 */
export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const FILES = "abcdefgh";
export const sqName = (i) => FILES[i & 7] + ((i >> 3) + 1);
export const sqIndex = (s) => s.charCodeAt(0) - 97 + (Number(s[1]) - 1) * 8;
export const colorOf = (p) => (p === null ? null : p === p.toUpperCase() ? "w" : "b");
export const other = (c) => (c === "w" ? "b" : "w");

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const inside = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;

const keyOf = (st) => `${st.board.map((p) => p ?? "-").join("")}${st.turn}${st.castling.K ? "K" : ""}${st.castling.Q ? "Q" : ""}${st.castling.k ? "k" : ""}${st.castling.q ? "q" : ""}${st.ep ?? ""}`;

export const fromFen = (fen = START_FEN) => {
  const [placement, turn = "w", castle = "-", ep = "-", half = "0", full = "1"] = fen.trim().split(/\s+/);
  const board = Array(64).fill(null);
  placement.split("/").forEach((row, i) => {
    let f = 0;
    for (const ch of row) /\d/.test(ch) ? (f += Number(ch)) : (board[(7 - i) * 8 + f++] = ch);
  });
  const st = { board, turn, castling: { K: castle.includes("K"), Q: castle.includes("Q"), k: castle.includes("k"), q: castle.includes("q") }, ep: ep === "-" ? null : sqIndex(ep), half: Number(half), full: Number(full), keys: [], san: [] };
  st.keys = [keyOf(st)];
  return st;
};
export const newGame = () => fromFen(START_FEN);

export const toFen = (st) => {
  const rows = [];
  for (let r = 7; r >= 0; r--) {
    let row = "", empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = st.board[r * 8 + f];
      if (p === null) empty++;
      else { row += (empty ? empty : "") + p; empty = 0; }
    }
    rows.push(row + (empty ? empty : ""));
  }
  const c = `${st.castling.K ? "K" : ""}${st.castling.Q ? "Q" : ""}${st.castling.k ? "k" : ""}${st.castling.q ? "q" : ""}` || "-";
  return `${rows.join("/")} ${st.turn} ${c} ${st.ep === null ? "-" : sqName(st.ep)} ${st.half} ${st.full}`;
};

// Apakah petak `sq` diserang oleh warna `by`?
export const attacked = (board, sq, by) => {
  const f = sq & 7, r = sq >> 3, up = by === "w";
  const pr = up ? r - 1 : r + 1;
  if (pr >= 0 && pr < 8) for (const df of [-1, 1]) if (inside(f + df, pr) && board[pr * 8 + f + df] === (up ? "P" : "p")) return true;
  for (const [df, dr] of KNIGHT) if (inside(f + df, r + dr) && board[(r + dr) * 8 + f + df] === (up ? "N" : "n")) return true;
  for (const [df, dr] of KING) if (inside(f + df, r + dr) && board[(r + dr) * 8 + f + df] === (up ? "K" : "k")) return true;
  const ray = (dirs, a, b) => {
    for (const [df, dr] of dirs) {
      for (let nf = f + df, nr = r + dr; inside(nf, nr); nf += df, nr += dr) {
        const p = board[nr * 8 + nf];
        if (p === null) continue;
        if (p === (up ? a : a.toLowerCase()) || p === (up ? b : b.toLowerCase())) return true;
        break;
      }
    }
    return false;
  };
  return ray(BISHOP, "B", "Q") || ray(ROOK, "R", "Q");
};

export const inCheck = (st, color = st.turn) => {
  const k = st.board.indexOf(color === "w" ? "K" : "k");
  return k >= 0 && attacked(st.board, k, other(color));
};

const pseudo = (st) => {
  const { board, turn, castling, ep } = st, moves = [], white = turn === "w";
  const mine = (p) => p !== null && white === (p === p.toUpperCase());
  const add = (from, to, piece, extra = {}) => moves.push({ from, to, piece, captured: board[to], promo: null, flag: null, ...extra });
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (!mine(p)) continue;
    const t = p.toUpperCase(), f = sq & 7, r = sq >> 3;
    if (t === "P") {
      const dir = white ? 1 : -1, start = white ? 1 : 6, last = white ? 7 : 0, one = sq + dir * 8;
      const push = (to, extra) => (to >> 3 === last ? ["Q", "R", "B", "N"].forEach((promo) => add(sq, to, p, { ...extra, promo })) : add(sq, to, p, extra));
      if (board[one] === null) {
        push(one);
        if (r === start && board[one + dir * 8] === null) add(sq, one + dir * 8, p, { flag: "double" });
      }
      for (const df of [-1, 1]) {
        if (!inside(f + df, r + dir)) continue;
        const to = one + df, target = board[to];
        if (target !== null && !mine(target)) push(to);
        else if (target === null && to === ep) add(sq, to, p, { captured: white ? "p" : "P", flag: "ep" });
      }
    } else if (t === "N" || t === "K") {
      for (const [df, dr] of t === "N" ? KNIGHT : KING) {
        if (!inside(f + df, r + dr)) continue;
        const to = (r + dr) * 8 + f + df;
        if (!mine(board[to])) add(sq, to, p);
      }
      if (t === "K") {
        const home = white ? 4 : 60, rook = white ? "R" : "r", foe = other(turn);
        if (sq === home && !attacked(board, home, foe)) {
          if (castling[white ? "K" : "k"] && board[home + 1] === null && board[home + 2] === null && board[home + 3] === rook && !attacked(board, home + 1, foe) && !attacked(board, home + 2, foe)) add(sq, home + 2, p, { flag: "castleK" });
          if (castling[white ? "Q" : "q"] && board[home - 1] === null && board[home - 2] === null && board[home - 3] === null && board[home - 4] === rook && !attacked(board, home - 1, foe) && !attacked(board, home - 2, foe)) add(sq, home - 2, p, { flag: "castleQ" });
        }
      }
    } else {
      for (const [df, dr] of t === "B" ? BISHOP : t === "R" ? ROOK : [...BISHOP, ...ROOK]) {
        for (let nf = f + df, nr = r + dr; inside(nf, nr); nf += df, nr += dr) {
          const to = nr * 8 + nf;
          if (board[to] === null) add(sq, to, p);
          else { if (!mine(board[to])) add(sq, to, p); break; }
        }
      }
    }
  }
  return moves;
};

export const apply = (st, m) => {
  const board = st.board.slice(), white = st.turn === "w";
  board[m.from] = null;
  board[m.to] = m.promo ? (white ? m.promo : m.promo.toLowerCase()) : m.piece;
  if (m.flag === "ep") board[m.to + (white ? -8 : 8)] = null;
  if (m.flag === "castleK") { board[m.to - 1] = board[m.to + 1]; board[m.to + 1] = null; }
  if (m.flag === "castleQ") { board[m.to + 1] = board[m.to - 2]; board[m.to - 2] = null; }
  const castling = { ...st.castling };
  if (m.piece === "K") { castling.K = false; castling.Q = false; }
  if (m.piece === "k") { castling.k = false; castling.q = false; }
  for (const sq of [m.from, m.to]) {
    if (sq === 0) castling.Q = false; if (sq === 7) castling.K = false;
    if (sq === 56) castling.q = false; if (sq === 63) castling.k = false;
  }
  const next = {
    board, turn: other(st.turn), castling, ep: m.flag === "double" ? (m.from + m.to) / 2 : null,
    half: m.piece.toUpperCase() === "P" || m.captured ? 0 : st.half + 1, full: st.full + (white ? 0 : 1), keys: st.keys, san: st.san,
  };
  next.keys = [...st.keys, keyOf(next)];
  return next;
};

export const legal = (st) => pseudo(st).filter((m) => !inCheck(apply(st, m), st.turn));

const insufficient = (board) => {
  const rest = board.map((p, i) => [p, i]).filter(([p]) => p !== null && p.toUpperCase() !== "K");
  if (!rest.length) return true;
  if (rest.length === 1 && "NnBb".includes(rest[0][0])) return true;
  if (rest.length === 2 && rest.every(([p]) => "Bb".includes(p))) {
    const shade = ([, i]) => ((i >> 3) + (i & 7)) % 2;
    return shade(rest[0]) === shade(rest[1]);
  }
  return false;
};

// { over, result: "checkmate"|"stalemate"|"fifty"|"material"|"repetition"|null, winner: "w"|"b"|null, check }
export const statusOf = (st, moves = legal(st)) => {
  const check = inCheck(st);
  if (!moves.length) return check ? { over: true, result: "checkmate", winner: other(st.turn), check } : { over: true, result: "stalemate", winner: null, check };
  if (insufficient(st.board)) return { over: true, result: "material", winner: null, check };
  if (st.half >= 100) return { over: true, result: "fifty", winner: null, check };
  const key = st.keys.at(-1);
  if (st.keys.filter((k) => k === key).length >= 3) return { over: true, result: "repetition", winner: null, check };
  return { over: false, result: null, winner: null, check };
};

export const toSan = (st, m, moves = legal(st)) => {
  let s;
  if (m.flag === "castleK") s = "O-O";
  else if (m.flag === "castleQ") s = "O-O-O";
  else {
    const t = m.piece.toUpperCase();
    s = "";
    if (t !== "P") {
      s += t;
      const rivals = moves.filter((x) => !(x.from === m.from && x.to === m.to) && x.piece === m.piece && x.to === m.to);
      if (rivals.length) {
        if (!rivals.some((x) => (x.from & 7) === (m.from & 7))) s += FILES[m.from & 7];
        else if (!rivals.some((x) => x.from >> 3 === m.from >> 3)) s += (m.from >> 3) + 1;
        else s += sqName(m.from);
      }
    } else if (m.captured) s += FILES[m.from & 7];
    if (m.captured) s += "x";
    s += sqName(m.to);
    if (m.promo) s += `=${m.promo}`;
  }
  const after = apply(st, m), stat = statusOf(after);
  return s + (stat.result === "checkmate" ? "#" : stat.check ? "+" : "");
};

// Cocokkan teks pemain dengan langkah legal: "e4", "Nf3", "exd5", "e8=Q", "O-O", "e2e4", "e2 e4".
// → { move } | { error: "illegal" | "ambiguous" }
export const parseMove = (st, input, moves = legal(st)) => {
  const text = String(input).trim().replace(/\s+/g, "").replace(/[!?]+$/, "");
  const pickPromo = (list, promo) => {
    const wanted = (promo ?? "Q").toUpperCase();
    const hit = list.filter((m) => !m.promo || m.promo === wanted);
    return hit.length === 1 ? { move: hit[0] } : hit.length ? { error: "ambiguous" } : { error: "illegal" };
  };

  if (/^(o-o-o|0-0-0)[+#]?$/i.test(text)) { const m = moves.find((x) => x.flag === "castleQ"); return m ? { move: m } : { error: "illegal" }; }
  if (/^(o-o|0-0)[+#]?$/i.test(text)) { const m = moves.find((x) => x.flag === "castleK"); return m ? { move: m } : { error: "illegal" }; }

  const coord = /^([a-h][1-8])[-x]?([a-h][1-8])=?([qrbn])?[+#]?$/i.exec(text);
  if (coord) {
    const from = sqIndex(coord[1].toLowerCase()), to = sqIndex(coord[2].toLowerCase());
    const list = moves.filter((m) => m.from === from && m.to === to);
    return list.length ? pickPromo(list, coord[3]) : { error: "illegal" };
  }

  for (const candidate of [text, text.replace(/^b/, "B")]) {
    const san = /^([KQRBNkqrn])?([a-h])?([1-8])?[x:]?([a-h][1-8])(?:=?([QRBNqrbn]))?[+#]?$/.exec(candidate);
    if (!san) continue;
    const piece = (san[1] ?? "P").toUpperCase(), to = sqIndex(san[4]);
    const file = san[2] ? san[2].charCodeAt(0) - 97 : null, rank = san[3] ? Number(san[3]) - 1 : null;
    const list = moves.filter((m) => m.to === to && m.piece.toUpperCase() === piece && (file === null || (m.from & 7) === file) && (rank === null || m.from >> 3 === rank));
    if (list.length) return pickPromo(list, san[5]);
  }
  return { error: "illegal" };
};

// Teks yang "mirip langkah catur" — dipakai supaya obrolan biasa tidak ditanggapi sebagai langkah.
export const looksLikeMove = (text) => /^([Oo]-[Oo](-[Oo])?|0-0(-0)?|[a-h][1-8][-x]?[a-h][1-8]=?[qrbn]?|[KQRBNkqrbn]?[a-h]?[1-8]?[x:]?[a-h][1-8](=?[QRBNqrbn])?)[+#]?[!?]*$/.test(String(text).trim().replace(/\s+/g, ""));

// Bidak yang sudah dimakan: { w: [...bidak putih yang hilang], b: [...] }, dan selisih materi (positif = putih unggul).
const VALUE = { P: 1, N: 3, B: 3, R: 5, Q: 9 };
export const material = (st) => {
  const start = { P: 8, N: 2, B: 2, R: 2, Q: 1 }, have = { w: { P: 0, N: 0, B: 0, R: 0, Q: 0 }, b: { P: 0, N: 0, B: 0, R: 0, Q: 0 } };
  for (const p of st.board) if (p && p.toUpperCase() !== "K") have[colorOf(p)][p.toUpperCase()]++;
  const lost = { w: [], b: [] };
  let diff = 0;
  for (const t of ["Q", "R", "B", "N", "P"]) {
    for (const c of ["w", "b"]) for (let i = 0; i < Math.max(0, start[t] - have[c][t]); i++) lost[c].push(t);
    diff += (have.w[t] - have.b[t]) * VALUE[t];
  }
  return { lost, diff };
};
