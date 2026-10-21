/*
 * Mesin UNO 2–10 pemain (tanpa I/O). Aturan resmi:
 *   • 108 kartu · tiap pemain 7 kartu · kartu pembuka selalu angka.
 *   • Cocokkan WARNA atau ANGKA/SIMBOL kartu teratas. Wild boleh kapan saja; Wild +4 hanya kalau tidak punya kartu warna yang sedang berlaku.
 *   • Skip → pemain berikutnya dilewati. Reverse → arah giliran berbalik (2 pemain: sama dengan Skip). +2 / +4 → pemain berikutnya ambil kartu & dilewati.
 *   • Tidak ada kartu cocok → ambil 1 kartu; kalau kartu itu bisa dimainkan boleh langsung dimainkan atau pass, kalau tidak giliran lewat otomatis.
 *   • UNO (sisa 1 kartu) diumumkan otomatis. Kartu habis duluan = menang.
 * Kartu = { c: "r"|"y"|"g"|"b"|"w", v: "0".."9" | "skip" | "rev" | "+2" | "wild" | "+4" }
 * Kode ketik: r5 · gskip (gs) · brev (brv) · y+2 (yd2) · w [warna] · +4 [warna]   (warna: r y g b / red yellow green blue / merah kuning hijau biru)
 */
export const COLORS = ["r", "y", "g", "b"];
export const COLOR_ICON = { r: "🔴", y: "🟡", g: "🟢", b: "🔵", w: "⚫" };
export const COLOR_ID = { r: "Merah", y: "Kuning", g: "Hijau", b: "Biru" };
export const COLOR_EN = { r: "Red", y: "Yellow", g: "Green", b: "Blue" };
const COLOR_WORDS = { r: "r", red: "r", merah: "r", y: "y", yellow: "y", kuning: "y", g: "g", green: "g", hijau: "g", b: "b", blue: "b", biru: "b" };
const ACTIONS = ["skip", "rev", "+2"];

export const isWild = (card) => card.c === "w";
export const cardCode = (card) => (isWild(card) ? (card.v === "+4" ? "+4" : "w") : `${card.c}${card.v}`);
export const sameCard = (a, b) => a.c === b.c && a.v === b.v;

export const buildDeck = () => {
  const deck = [];
  for (const c of COLORS) {
    deck.push({ c, v: "0" });
    for (let n = 1; n <= 9; n++) deck.push({ c, v: String(n) }, { c, v: String(n) });
    for (const v of ACTIONS) deck.push({ c, v }, { c, v });
  }
  for (let i = 0; i < 4; i++) deck.push({ c: "w", v: "wild" }, { c: "w", v: "+4" });
  return deck;
};

export const shuffle = (list, rng = Math.random) => {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

const ORDER = { r: 0, y: 1, g: 2, b: 3, w: 4 };
const VALUE_ORDER = (v) => (/^\d$/.test(v) ? Number(v) : { skip: 10, rev: 11, "+2": 12, wild: 13, "+4": 14 }[v]);
export const sortHand = (hand) => hand.sort((a, b) => ORDER[a.c] - ORDER[b.c] || VALUE_ORDER(a.v) - VALUE_ORDER(b.v));

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;

export const newGame = (n = 2, rng = Math.random) => {
  if (!(n >= MIN_PLAYERS && n <= MAX_PLAYERS)) throw new RangeError(`UNO needs ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
  const draw = shuffle(buildDeck(), rng);
  const hands = Array.from({ length: n }, () => []);
  for (let i = 0; i < 7; i++) for (const hand of hands) hand.push(draw.pop());
  // kartu pembuka harus angka — yang lain diselipkan kembali ke tumpukan
  let top = draw.pop();
  while (!/^\d$/.test(top.v)) { draw.unshift(top); top = draw.pop(); }
  for (const hand of hands) sortHand(hand);
  return { draw, discard: [top], hands, turn: Math.floor(rng() * n), dir: 1, color: top.c, drew: null, plays: 0, winner: null };
};

// Pemain berikutnya sesuai arah (steps langkah)
export const nextOf = (st, from, steps = 1) => {
  const n = st.hands.length;
  return (((from + st.dir * steps) % n) + n) % n;
};

export const top = (st) => st.discard.at(-1);

// Boleh dimainkan? (hand = tangan pemain, untuk aturan Wild +4)
export const canPlay = (st, card, hand) => {
  if (st.drew && !sameCard(st.drew, card)) return false;
  if (card.c === "w") return card.v !== "+4" || !hand.some((h) => h.c === st.color);
  return card.c === st.color || card.v === top(st).v;
};
export const playableCards = (st, side) => st.hands[side].filter((card) => canPlay(st, card, st.hands[side]));

// Teks → { type: "card", c, v, color? } | { type: "draw" } | { type: "pass" } | null
export const parseInput = (raw) => {
  const text = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (/^(draw|d|ambil|tarik kartu)$/.test(text)) return { type: "draw" };
  if (/^(pass|lewat|skip turn)$/.test(text)) return { type: "pass" };
  let m = text.match(/^(?:\+4|w4|wild ?\+4|wild4)(?: ?([a-z]+))?$/);
  if (m) { const color = m[1] ? COLOR_WORDS[m[1]] : null; return m[1] && !color ? null : { type: "card", c: "w", v: "+4", color }; }
  m = text.match(/^(?:w|wild)(?: ?([a-z]+))?$/);
  if (m) { const color = m[1] ? COLOR_WORDS[m[1]] : null; return m[1] && !color ? null : { type: "card", c: "w", v: "wild", color }; }
  m = text.match(/^([rygb]) ?(\d|skip|s|rev|rv|reverse|\+2|d2|draw2)$/);
  if (m) {
    const v = { s: "skip", rv: "rev", reverse: "rev", d2: "+2", draw2: "+2" }[m[2]] ?? m[2];
    return { type: "card", c: m[1], v };
  }
  return null;
};
export const looksLikeUno = (text) => parseInput(text) !== null;

const refill = (st) => {
  if (st.draw.length) return;
  const keep = st.discard.pop();
  st.draw = shuffle(st.discard.map((c) => (c.v === "wild" || c.v === "+4" ? { c: "w", v: c.v } : c)));
  st.discard = [keep];
};
const take = (st, side, n) => {
  const got = [];
  for (let i = 0; i < n; i++) {
    refill(st);
    if (!st.draw.length) break;
    const card = st.draw.pop();
    st.hands[side].push(card); got.push(card);
  }
  sortHand(st.hands[side]);
  return got;
};

const mostColor = (hand) => {
  const n = { r: 0, y: 0, g: 0, b: 0 };
  for (const card of hand) if (card.c !== "w") n[card.c]++;
  return COLORS.reduce((best, c) => (n[c] > n[best] ? c : best), COLORS[0]);
};

// Mainkan kartu. → { error } | { ev: { type, card, color, drawn, uno, win } }
export const play = (st, side, want) => {
  if (st.winner !== null) return { error: "over" };
  if (st.turn !== side) return { error: "turn" };
  const hand = st.hands[side];
  const card = hand.find((h) => h.c === want.c && h.v === want.v);
  if (!card) return { error: "nocard" };
  if (!canPlay(st, card, hand)) return { error: card.v === "+4" ? "wild4" : st.drew ? "drewOnly" : "illegal" };

  hand.splice(hand.indexOf(card), 1);
  st.discard.push(card);
  st.drew = null;
  st.plays++;
  st.color = isWild(card) ? (want.color ?? mostColor(hand)) : card.c;
  const ev = { type: "play", card, color: st.color, drawn: 0, uno: false, win: false, side, victim: null, skipped: null, reversed: false };

  const n = st.hands.length;
  if (card.v === "rev") {
    if (n > 2) { st.dir = -st.dir; ev.reversed = true; }
    // 2 pemain: Reverse = Skip
    ev.skipped = n === 2 ? nextOf(st, side) : null;
    st.turn = n === 2 ? side : nextOf(st, side);
  } else if (card.v === "skip") {
    ev.skipped = nextOf(st, side);
    st.turn = nextOf(st, side, 2);
  } else if (card.v === "+2" || card.v === "+4") {
    const victim = nextOf(st, side);
    ev.victim = victim; ev.skipped = victim;
    ev.drawn = take(st, victim, card.v === "+2" ? 2 : 4).length;
    st.turn = nextOf(st, side, 2);
  } else {
    st.turn = nextOf(st, side);
  }

  if (!hand.length) { st.winner = side; ev.win = true; }
  else ev.uno = hand.length === 1;
  return { ev };
};

// Ambil 1 kartu (tidak ada kartu cocok / mau ambil). → { error } | { ev: { type: "draw", card, playable } }
export const draw = (st, side) => {
  if (st.winner !== null) return { error: "over" };
  if (st.turn !== side) return { error: "turn" };
  if (st.drew) return { error: "alreadyDrew" };
  const [card] = take(st, side, 1);
  if (!card) { st.turn = nextOf(st, side); return { ev: { type: "draw", card: null, playable: false, side } }; }
  const playable = canPlay({ ...st, drew: null }, card, st.hands[side]);
  if (playable) st.drew = card; else st.turn = nextOf(st, side);
  return { ev: { type: "draw", card, playable, side } };
};

export const pass = (st, side) => {
  if (st.winner !== null) return { error: "over" };
  if (st.turn !== side) return { error: "turn" };
  if (!st.drew) return { error: "mustDraw" };
  st.drew = null; st.turn = nextOf(st, side);
  return { ev: { type: "pass", side } };
};

// Pemain keluar (menyerah / kehabisan waktu). Kartunya dikocok kembali ke tumpukan ambil. → pemain tersisa = pemenang bila tinggal 1.
export const removePlayer = (st, side, rng = Math.random) => {
  const gone = st.hands.splice(side, 1)[0];
  st.draw = shuffle([...st.draw, ...gone.map((c) => (c.c === "w" ? { c: "w", v: c.v } : c))], rng);
  const n = st.hands.length;
  if (side === st.turn) { st.drew = null; st.turn = st.dir === 1 ? side % n : (side - 1 + n) % n; }
  else if (side < st.turn) st.turn -= 1;
  if (n === 1) st.winner = 0;
  return n;
};
