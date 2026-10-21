(function () {
'use strict';
/*
 * Miyako Abyss — mesin dungeon roguelike deterministik (satu sumber untuk sheet WhatsApp DAN verifikasi di bot).
 * Semua keacakan lewat RNG ber-seed milik sesi → bot memutar ulang daftar aksi pemain dan menghitung hasilnya sendiri.
 * Aksi (byte):  fase class: 0-2 · fase diff: 0-2 · battle: 0 serang, 1 skill, 2 jaga, 3 ramuan ·
 *               reward: 10-12 (pilih kartu) · shop: 20 lanjut, 21 ramuan, 22 pulihkan, 23 +ATK, 24 +DEF · 99 = berhenti (retire)
 */
function rng(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var CLASSES = [
  { id: 'knight', name: 'Knight', icon: '🛡️', hero: '🤺', hp: 1.25, atk: 1.12, def: 1.5, mp: 55, cost: 25, skill: 'Heavy Strike', desc: 'Tangguh. Skill: pukulan berat 2.0× ATK.' },
  { id: 'mage', name: 'Mage', icon: '🔮', hero: '🧙', hp: 0.85, atk: 0.95, def: 0.8, mp: 90, cost: 30, skill: 'Fireball', desc: 'MP besar. Skill: bola api 2.3× menembus DEF.' },
  { id: 'rogue', name: 'Rogue', icon: '🗡️', hero: '🥷', hp: 1.0, atk: 1.15, def: 0.9, mp: 60, cost: 25, skill: 'Triple Stab', desc: 'Cepat & kritis. Skill: 3 tusukan (kritis tinggi).' }
];
var DIFF = [
  { name: 'Normal', hp: 1.05, atk: 1.0, gold: 1.0 },
  { name: 'Hard', hp: 1.4, atk: 1.3, gold: 1.5 },
  { name: 'Nightmare', hp: 1.85, atk: 1.65, gold: 2.2 }
];
// nama, ikon, hp, atk, def, emas, boss
var FOES = [
  ['Slime', '🦠', 42, 9, 1, 30, 0], ['Serigala', '🐺', 58, 12, 2, 36, 0], ['Goblin', '👺', 72, 15, 3, 44, 0], ['Kelelawar', '🦇', 80, 18, 3, 52, 0],
  ['Raja Troll', '👹', 230, 22, 6, 160, 1],
  ['Laba-laba', '🕷️', 130, 27, 6, 70, 0], ['Golem', '🗿', 190, 30, 11, 82, 0], ['Griffin', '🦅', 170, 38, 8, 94, 0], ['Vampir', '🧛', 210, 44, 11, 110, 0],
  ['Naga Abyss', '🐉', 560, 58, 16, 400, 1]
];
var RELICS = [
  { id: 0, name: 'Cincin Berserk', icon: '💍', desc: '+20% ATK' },
  { id: 1, name: 'Pelat Besi', icon: '🛡️', desc: '+4 DEF' },
  { id: 2, name: 'Taring Vampir', icon: '🦷', desc: 'Sembuh 12% dari damage' },
  { id: 3, name: 'Kristal Mana', icon: '💎', desc: '+30 MP maks, +6 regen MP' },
  { id: 4, name: 'Koin Hoki', icon: '🪙', desc: '+35% emas' },
  { id: 5, name: 'Bulu Phoenix', icon: '🪶', desc: 'Hidup lagi sekali (40% HP)' },
  { id: 6, name: 'Sepatu Angin', icon: '👟', desc: '14% menghindar' },
  { id: 7, name: 'Pedang Tajam', icon: '🔪', desc: '+15% peluang kritis' },
  { id: 8, name: 'Permata Hati', icon: '❤️', desc: '+35 HP maks & sembuh 35' }
];
var SHOP = { potion: 45, heal: 55, atk: 95, def: 85 };

/* cfg: { seed, hp, atk, def } = kekuatan dasar dari RPG pemain (diberikan bot). */
function create(cfg) {
  return { cfg: cfg, r: rng(cfg.seed >>> 0), phase: 'class', cls: -1, diff: 0, floor: 0, cleared: 0, kills: 0, gold: 0, earned: 0, n: 0,
    hero: null, foe: null, offer: [], relics: [], log: [], dead: false, won: false, retired: false, upg: 0, last: null };
}

function mkHero(s) {
  var c = CLASSES[s.cls], g = s.cfg;
  var hp = Math.round((80 + Math.min(g.hp, 600) * 0.1) * c.hp);
  s.hero = { hp: hp, maxHp: hp, mp: c.mp, maxMp: c.mp, atk: Math.round((9 + Math.min(g.atk, 80) * 0.15) * c.atk), def: Math.round((2 + Math.min(g.def, 60) * 0.12) * c.def), potions: 2, crit: 0.1, regen: 8, dodge: 0, drain: 0, goldMul: 1, revive: 0, guard: 0, lv: 1 };
}

function hasRelic(s, id) { return s.relics.indexOf(id) >= 0; }

function spawn(s) {
  var f = FOES[s.floor - 1], d = DIFF[s.diff];
  s.foe = { name: f[0], icon: f[1], boss: f[6], maxHp: Math.round(f[2] * d.hp), hp: Math.round(f[2] * d.hp), atk: Math.round(f[3] * d.atk), def: f[4], gold: Math.round(f[5] * d.gold), intent: 'atk', guard: 0, enraged: 0, turn: 0 };
  pickIntent(s);
}

function pickIntent(s) {
  var e = s.foe, x = s.r();
  e.turn++;
  if (e.boss) {
    if (!e.enraged && e.hp < e.maxHp * 0.5) { e.intent = 'enrage'; return; }
    e.intent = x < 0.5 ? 'atk' : x < 0.75 ? 'heavy' : x < 0.9 ? 'guard' : 'heal';
  } else e.intent = x < 0.62 ? 'atk' : x < 0.85 ? 'heavy' : 'guard';
}

function dmgTo(s, atk, mult, def, canCrit, forceCrit) {
  var h = s.hero, crit = canCrit && (forceCrit || s.r() < h.crit);
  var v = Math.round(atk * mult * (0.9 + s.r() * 0.2) - def * 0.5);
  if (v < 1) v = 1;
  if (crit) v = Math.round(v * 1.8);
  return { v: v, crit: crit };
}

function levelUp(s) {
  var h = s.hero;
  h.lv++; h.maxHp += 9; h.atk += 1 + (h.lv % 2); h.def += h.lv % 2;
  h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * 0.25));
  h.mp = h.maxMp;
}

// Satu aksi. Mengembalikan true bila valid & diterapkan.
function act(s, a) {
  if (s.dead || s.won || s.retired) return false;
  var h = s.hero, e = s.foe, ph = s.phase, i;
  s.last = { a: a, ev: [] };
  var ev = s.last.ev;

  if (a === 99 && ph !== 'class' && ph !== 'diff') { s.retired = true; s.phase = 'over'; s.n++; return true; }

  if (ph === 'class') {
    if (a < 0 || a > 2) return false;
    s.cls = a; s.phase = 'diff'; s.n++; return true;
  }
  if (ph === 'diff') {
    if (a < 0 || a > 2) return false;
    s.diff = a; mkHero(s); s.floor = 1; spawn(s); s.phase = 'battle'; s.n++; return true;
  }

  if (ph === 'reward') {
    if (a < 10 || a >= 10 + s.offer.length) return false;
    var rl = s.offer[a - 10];
    s.relics.push(rl);
    if (rl === 0) h.atk = Math.round(h.atk * 1.2);
    if (rl === 1) h.def += 4;
    if (rl === 2) h.drain = 0.12;
    if (rl === 3) { h.maxMp += 30; h.mp += 30; h.regen += 6; }
    if (rl === 4) h.goldMul = 1.35;
    if (rl === 5) h.revive = 1;
    if (rl === 6) h.dodge = 0.14;
    if (rl === 7) h.crit += 0.15;
    if (rl === 8) { h.maxHp += 35; h.hp = Math.min(h.maxHp, h.hp + 35); }
    s.phase = 'shop'; s.n++; return true;
  }

  if (ph === 'shop') {
    if (a === 20) { s.floor++; spawn(s); s.phase = 'battle'; s.n++; return true; }
    var cost;
    if (a === 21) { cost = SHOP.potion + s.floor * 5; if (s.gold < cost || h.potions >= 6) return false; s.gold -= cost; h.potions++; }
    else if (a === 22) { cost = SHOP.heal; if (s.gold < cost || h.hp >= h.maxHp) return false; s.gold -= cost; h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * 0.4)); }
    else if (a === 23) { cost = SHOP.atk + 35 * s.upg; if (s.gold < cost) return false; s.gold -= cost; s.upg++; h.atk += 3; }
    else if (a === 24) { cost = SHOP.def + 30 * s.upg; if (s.gold < cost) return false; s.gold -= cost; s.upg++; h.def += 2; }
    else return false;
    s.n++; return true;
  }

  // ph === 'battle'
  if (a < 0 || a > 3) return false;
  var c = CLASSES[s.cls];
  if (a === 1 && h.mp < c.cost) return false;
  if (a === 3 && h.potions < 1) return false;

  var dealt = 0;
  h.guard = 0;
  if (a === 0) {
    var d0 = dmgTo(s, h.atk, 1, e.def * (e.guard ? 1 : 1), true);
    dealt = e.guard ? Math.ceil(d0.v * 0.5) : d0.v;
    ev.push({ t: 'hit', who: 'foe', v: dealt, crit: d0.crit, fx: 'slash' });
  } else if (a === 1) {
    h.mp -= c.cost;
    if (s.cls === 0) { var d1 = dmgTo(s, h.atk, 2.0, e.def, true); dealt = e.guard ? Math.ceil(d1.v * 0.5) : d1.v; ev.push({ t: 'hit', who: 'foe', v: dealt, crit: d1.crit, fx: 'smash' }); }
    else if (s.cls === 1) { var d2 = dmgTo(s, h.atk, 2.3, 0, true); dealt = e.guard ? Math.ceil(d2.v * 0.5) : d2.v; ev.push({ t: 'hit', who: 'foe', v: dealt, crit: d2.crit, fx: 'fire' }); }
    else {
      for (i = 0; i < 3; i++) { var d3 = dmgTo(s, h.atk, 0.8, e.def, true, s.r() < 0.25); var v3 = e.guard ? Math.ceil(d3.v * 0.5) : d3.v; dealt += v3; ev.push({ t: 'hit', who: 'foe', v: v3, crit: d3.crit, fx: 'stab' }); }
    }
  } else if (a === 2) {
    h.guard = 1; h.mp = Math.min(h.maxMp, h.mp + 12); ev.push({ t: 'guard' });
  } else {
    h.potions--; var heal = Math.round(h.maxHp * 0.45); h.hp = Math.min(h.maxHp, h.hp + heal); ev.push({ t: 'heal', who: 'hero', v: heal });
  }
  if (dealt) {
    e.hp -= dealt;
    if (h.drain && dealt > 0) { var dr = Math.max(1, Math.round(dealt * h.drain)); h.hp = Math.min(h.maxHp, h.hp + dr); ev.push({ t: 'heal', who: 'hero', v: dr }); }
  }
  s.n++;

  if (e.hp <= 0) {
    e.hp = 0; s.kills++; s.cleared = s.floor;
    var g = Math.round(e.gold * h.goldMul);
    s.gold += g; s.earned += g; ev.push({ t: 'win', gold: g });
    if (s.floor >= FOES.length) { s.won = true; s.phase = 'over'; return true; }
    levelUp(s);
    // tiga kartu relik (tanpa duplikat; phoenix cuma sekali)
    var pool = [];
    for (i = 0; i < RELICS.length; i++) if (!hasRelic(s, i)) pool.push(i);
    s.offer = [];
    while (s.offer.length < 3 && pool.length) s.offer.push(pool.splice(Math.floor(s.r() * pool.length), 1)[0]);
    s.phase = s.offer.length ? 'reward' : 'shop';
    return true;
  }

  // giliran musuh
  var prevGuard = e.guard;
  e.guard = 0;
  if (e.intent === 'guard') { e.guard = 1; ev.push({ t: 'foeGuard' }); }
  else if (e.intent === 'heal') { var hv = Math.round(e.maxHp * 0.1); e.hp = Math.min(e.maxHp, e.hp + hv); ev.push({ t: 'heal', who: 'foe', v: hv }); }
  else if (e.intent === 'enrage') { e.enraged = 1; e.atk = Math.round(e.atk * 1.25); ev.push({ t: 'enrage' }); }
  else {
    if (h.dodge && s.r() < h.dodge) ev.push({ t: 'dodge' });
    else {
      var m = e.intent === 'heavy' ? 1.7 : 1;
      var d = dmgTo(s, e.atk, m, h.def * 1.2 / 1, false);
      var v = h.guard ? Math.ceil(d.v * 0.4) : d.v;
      h.hp -= v; ev.push({ t: 'hit', who: 'hero', v: v, crit: e.intent === 'heavy', fx: 'claw' });
    }
  }
  h.mp = Math.min(h.maxMp, h.mp + h.regen);
  if (h.hp <= 0) {
    if (h.revive) { h.revive = 0; h.hp = Math.round(h.maxHp * 0.4); ev.push({ t: 'revive' }); }
    else { h.hp = 0; s.dead = true; s.phase = 'over'; ev.push({ t: 'dead' }); return true; }
  }
  pickIntent(s);
  return true;
}

// aksi yang sah saat ini (untuk UI & bot simulasi)
function valid(s) {
  var o = [], h = s.hero, i;
  if (s.dead || s.won || s.retired) return o;
  if (s.phase === 'class') return [0, 1, 2];
  if (s.phase === 'diff') return [0, 1, 2];
  if (s.phase === 'reward') { for (i = 0; i < s.offer.length; i++) o.push(10 + i); return o; }
  if (s.phase === 'shop') {
    o.push(20);
    if (s.gold >= SHOP.potion + s.floor * 5 && h.potions < 6) o.push(21);
    if (s.gold >= SHOP.heal && h.hp < h.maxHp) o.push(22);
    if (s.gold >= SHOP.atk + 35 * s.upg) o.push(23);
    if (s.gold >= SHOP.def + 30 * s.upg) o.push(24);
    return o;
  }
  o.push(0, 2);
  if (h.mp >= CLASSES[s.cls].cost) o.push(1);
  if (h.potions > 0) o.push(3);
  return o;
}

/* Putar ulang: actions = array byte. → { ok, over, cleared, won, dead, retired, kills, gold, diff, cls, n } */
function replay(cfg, actions) {
  var s = create(cfg), i;
  if (actions.length > 600) return { ok: false, error: 'too long' };
  for (i = 0; i < actions.length; i++) if (!act(s, actions[i])) return { ok: false, error: 'illegal at ' + i };
  var over = s.dead || s.won || s.retired;
  return { ok: true, over: over, cleared: s.cleared, won: s.won, dead: s.dead, retired: s.retired, kills: s.kills, gold: s.earned, diff: s.diff, cls: s.cls, n: s.n };
}

function enc(actions) {
  var bin = '';
  for (var i = 0; i < actions.length; i++) bin += String.fromCharCode(actions[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function dec(str) {
  var b64 = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  var bin;
  try { bin = atob(b64); } catch (e) { return null; }
  var o = [];
  for (var i = 0; i < bin.length; i++) o.push(bin.charCodeAt(i));
  return o;
}

return { create: create, act: act, valid: valid, replay: replay, enc: enc, dec: dec, CLASSES: CLASSES, DIFF: DIFF, FOES: FOES, RELICS: RELICS, SHOP: SHOP, FLOORS: FOES.length };
})()
