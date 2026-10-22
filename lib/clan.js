import crypto from "node:crypto";
import { config } from "#lib/config";
import { clansTable } from "#lib/clantable";
import { db } from "#lib/database";
import { prize } from "#lib/prize";
import * as game from "#lib/rpg";
import { fmt, tr } from "#lib/tr";
import { dayKey, numberOf, randomInt } from "#lib/utils";

/*
 * Mesin KLAN + WAR KLAN (tanpa I/O pesan; pengiriman pesan dilakukan plugin / lib/sched.js).
 *   Klan   : buat, gabung (terbuka / undangan), peran leader·officer·member, kas klan (donasi), upgrade level (+2% HP/ATK/DEF tiap level
 *            untuk semua anggota — lihat statsOf di lib/rpg.js), check-in harian, riwayat.
 *   War    : tantang klan lain (atau cari lawan otomatis) → roster terkuat tiap klan di-snapshot → tiap anggota punya WAR_ATTACKS serangan
 *            ke musuh pilihan (ranking #) → ⭐ 1–3 per serangan (bintang terbaik per target dihitung) → bintang terbanyak menang.
 *            Hadiah: Gold ACAK (500–2000 pemenang · 250–1000 lainnya) untuk anggota yang ikut menyerang + trofi + kas klan.
 * Data: tabel clans (clansTable), war disimpan di db.settings.wars; tantangan / antrean / undangan hanya di memori (sementara).
 */
export const table = clansTable;
export const CFG = {
  createCost: 10_000, minLevel: 5, maxLevel: 10, maxOfficers: 3,
  warMinMembers: 3, warMaxRoster: 10, warMs: 6 * 3_600_000, warAttacks: 2, warAttackCd: 5 * 60_000,
  challengeMs: 10 * 60_000, queueMs: 15 * 60_000, inviteMs: 10 * 60_000, logMax: 12,
};
const mem = (globalThis.__miyakoClanMem ??= { invites: new Map(), challenges: new Map(), queue: new Map() });
const now = () => Date.now();

/* ── util ────────────────────────────────────────────────────────────────── */
export const cleanName = (raw) => String(raw ?? "").replace(/\s+/g, " ").trim();
export const slug = (name) => cleanName(name).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
export const validName = (name) => /^[\p{L}\p{N} ]{3,16}$/u.test(name) && slug(name).length >= 3;
export const tagOf = (name) => name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 4).toUpperCase();
export const memberCap = (c) => 10 + 2 * c.lvl;
export const upgradeCost = (c) => 10_000 * c.lvl ** 2;
export const size = (c) => Object.keys(c.members).length;
export const roleOf = (c, jid) => c.members[jid]?.role ?? null;
export const canManage = (c, jid) => ["leader", "officer"].includes(roleOf(c, jid));
const RANK = { leader: 3, officer: 2, member: 1 };
const rpgOf = (jid) => (db.users[jid] ? game.getRpg(db.users[jid]) : null);
export const nameOfJid = (jid) => db.users[jid]?.reg?.name ?? db.users[jid]?.name ?? numberOf(jid);
export const powerOf = (s) => Math.round(s.maxHp / 4 + s.atk * 3 + s.def * 4);

export const getClan = (query) => {
  const q = cleanName(query).toLowerCase().replace(/^\[|\]$/g, "");
  if (!q) return null;
  return clansTable()[slug(q)] ?? Object.values(clansTable()).find((c) => c.name.toLowerCase() === q || c.tag.toLowerCase() === q) ?? null;
};

// Klan pemain (membersihkan referensi basi bila klan bubar / pemain sudah dikeluarkan)
export const clanOf = (jid) => {
  const r = db.users[jid]?.rpg;
  if (!r?.clan) return null;
  const c = clansTable()[r.clan];
  if (c?.members[jid]) return c;
  delete r.clan;
  return null;
};

const addLog = (c, text) => { c.log.unshift({ at: now(), text }); c.log.length = Math.min(c.log.length, CFG.logMax); };
const save = () => { db.save("clans"); db.save("users"); db.save("settings"); };
const newMember = (role) => ({ role, joined: now(), contrib: 0, stars: 0, daily: "" });

export const ranked = (c) => Object.keys(c.members)
  .map((jid) => { const r = rpgOf(jid); if (!r) return null; const stats = game.statsOf(r); return { jid, name: nameOfJid(jid), lvl: r.lvl, role: c.members[jid].role, stats, power: powerOf(stats) }; })
  .filter(Boolean)
  .sort((a, b) => b.power - a.power);
export const clanPower = (c) => ranked(c).reduce((s, m) => s + m.power, 0);
export const topClans = (n = 10) => Object.values(clansTable()).sort((a, b) => b.trophies - a.trophies || size(b) - size(a)).slice(0, n);

/* ── klan ────────────────────────────────────────────────────────────────── */
export const createClan = (jid, rawName, r, chat) => {
  const name = cleanName(rawName);
  if (clanOf(jid)) return { error: "inClan" };
  if (!validName(name)) return { error: "badName" };
  if (r.lvl < CFG.minLevel) return { error: "level", need: CFG.minLevel };
  if (clansTable()[slug(name)]) return { error: "taken" };
  if (r.gold < CFG.createCost) return { error: "gold", need: CFG.createCost };
  r.gold -= CFG.createCost;
  const clan = (clansTable()[slug(name)] = { id: slug(name), name, tag: tagOf(name), desc: "", lvl: 1, treasury: 0, open: true, createdAt: now(), chat, members: { [jid]: newMember("leader") }, wins: 0, losses: 0, trophies: 0, war: null, log: [] });
  r.clan = clan.id;
  addLog(clan, `👑 ${nameOfJid(jid)} created the clan`);
  save();
  return { clan };
};

export const invite = (c, by, target) => {
  if (!canManage(c, by)) return { error: "perm" };
  if (clanOf(target)) return { error: "targetInClan" };
  if (size(c) >= memberCap(c)) return { error: "full" };
  mem.invites.set(`${c.id}|${target}`, now() + CFG.inviteMs);
  return { ok: true };
};
export const invitesFor = (jid) => Object.values(clansTable()).filter((c) => (mem.invites.get(`${c.id}|${jid}`) ?? 0) > now());

export const joinClan = (jid, c, r) => {
  if (clanOf(jid)) return { error: "inClan" };
  if (size(c) >= memberCap(c)) return { error: "full" };
  const invited = (mem.invites.get(`${c.id}|${jid}`) ?? 0) > now();
  if (!c.open && !invited) return { error: "closed" };
  c.members[jid] = newMember("member");
  r.clan = c.id;
  mem.invites.delete(`${c.id}|${jid}`);
  addLog(c, `➕ ${nameOfJid(jid)} joined`);
  save();
  return { ok: true };
};

export const leaveClan = (jid) => {
  const c = clanOf(jid);
  if (!c) return { error: "noClan" };
  if (c.war) return { error: "inWar" };
  if (c.members[jid].role === "leader") {
    if (size(c) > 1) return { error: "leaderLeave" };
    return disband(c, jid);
  }
  delete c.members[jid];
  delete db.users[jid].rpg.clan;
  addLog(c, `🚪 ${nameOfJid(jid)} left`);
  save();
  return { ok: true, clan: c };
};

export const kick = (c, by, target) => {
  if (!canManage(c, by)) return { error: "perm" };
  if (!c.members[target]) return { error: "notMember" };
  if (target === by) return { error: "self" };
  if (RANK[c.members[target].role] >= RANK[c.members[by].role]) return { error: "rank" };
  if (c.war) return { error: "inWar" };
  delete c.members[target];
  if (db.users[target]?.rpg) delete db.users[target].rpg.clan;
  addLog(c, `🥾 ${nameOfJid(target)} kicked by ${nameOfJid(by)}`);
  save();
  return { ok: true };
};

export const setRole = (c, by, target, role) => {
  if (c.members[by]?.role !== "leader") return { error: "leaderOnly" };
  if (!c.members[target] || target === by) return { error: "notMember" };
  if (role === "officer" && Object.values(c.members).filter((m) => m.role === "officer").length >= CFG.maxOfficers) return { error: "maxOfficers" };
  if (role === "leader") { c.members[by].role = "officer"; }
  c.members[target].role = role;
  addLog(c, `${role === "leader" ? "👑" : role === "officer" ? "⭐" : "⬇️"} ${nameOfJid(target)} → ${role}`);
  save();
  return { ok: true };
};

export const disband = (c, by) => {
  if (c.members[by]?.role !== "leader") return { error: "leaderOnly" };
  if (c.war) return { error: "inWar" };
  for (const jid of Object.keys(c.members)) if (db.users[jid]?.rpg) delete db.users[jid].rpg.clan;
  delete clansTable()[c.id];
  save();
  return { ok: true, disbanded: true, clan: c };
};

export const donate = (c, jid, r, amount) => {
  const amt = Math.floor(amount);
  if (!(amt >= 100)) return { error: "min", min: 100 };
  if (r.gold < amt) return { error: "gold" };
  r.gold -= amt; c.treasury += amt; c.members[jid].contrib += amt;
  addLog(c, `💰 ${nameOfJid(jid)} donated ${fmt(amt)}`);
  save();
  return { ok: true, amt };
};

export const upgrade = (c, by) => {
  if (!canManage(c, by)) return { error: "perm" };
  if (c.lvl >= CFG.maxLevel) return { error: "max" };
  const cost = upgradeCost(c);
  if (c.treasury < cost) return { error: "treasury", cost };
  c.treasury -= cost; c.lvl++;
  addLog(c, `⬆️ Clan level ${c.lvl}`);
  save();
  return { ok: true, cost };
};

export const dailyClaim = (c, jid, r) => {
  const m = c.members[jid], today = dayKey(config.timezone);
  if (m.daily === today) return { error: "done" };
  m.daily = today;
  const gold = prize(500, 1200), xp = 40 + c.lvl * 10;
  r.gold += gold; game.xpRows(r, xp);
  c.treasury += 250;
  save();
  return { ok: true, gold, xp };
};

/* ── war ─────────────────────────────────────────────────────────────────── */
const wars = () => (db.settings.wars ??= {});
export const warOf = (c) => {
  if (!c?.war) return null;
  const w = wars()[c.war];
  if (!w || w.state !== "active") { c.war = null; return null; }
  return w;
};
const foeOf = (war, clanId) => (war.a === clanId ? war.b : war.a);
export const stars = (war, clanId) => war.rosters[foeOf(war, clanId)].reduce((s, d) => s + d.stars, 0); // bintang yang dikumpulkan klan ini
export const destruction = (war, clanId) => war.rosters[foeOf(war, clanId)].reduce((s, d) => s + d.dmg, 0);

const eligibleForWar = (c) => size(c) >= CFG.warMinMembers;

export const startWar = (a, b) => {
  const n = Math.min(CFG.warMaxRoster, size(a), size(b));
  const roster = (c) => ranked(c).slice(0, n).map((m) => ({ jid: m.jid, name: m.name, power: m.power, stats: m.stats, att: 0, last: 0, stars: 0, dmg: 0 }));
  const war = { id: crypto.randomBytes(3).toString("hex"), a: a.id, b: b.id, start: now(), end: now() + CFG.warMs, state: "active", rosters: { [a.id]: roster(a), [b.id]: roster(b) }, log: [], chats: { [a.id]: a.chat, [b.id]: b.chat } };
  wars()[war.id] = war;
  a.war = war.id; b.war = war.id;
  mem.challenges.delete(a.id); mem.challenges.delete(b.id); mem.queue.delete(a.id); mem.queue.delete(b.id);
  addLog(a, `⚔️ War vs ${b.name}`); addLog(b, `⚔️ War vs ${a.name}`);
  save();
  return war;
};

export const declareWar = (c, by, target) => {
  if (!canManage(c, by)) return { error: "perm" };
  if (target.id === c.id) return { error: "self" };
  if (warOf(c)) return { error: "inWar" };
  if (warOf(target)) return { error: "targetInWar" };
  if (!eligibleForWar(c) || !eligibleForWar(target)) return { error: "tooSmall", min: CFG.warMinMembers };
  const back = mem.challenges.get(c.id);
  if (back && back.from === target.id && back.until > now()) return { war: startWar(target, c), started: true };
  mem.challenges.set(target.id, { from: c.id, by, until: now() + CFG.challengeMs });
  return { ok: true };
};
export const pendingChallenge = (c) => {
  const ch = mem.challenges.get(c.id);
  if (!ch || ch.until < now()) { mem.challenges.delete(c.id); return null; }
  return ch;
};
export const acceptWar = (c, by) => {
  if (!canManage(c, by)) return { error: "perm" };
  const ch = pendingChallenge(c);
  if (!ch) return { error: "none" };
  const from = clansTable()[ch.from];
  if (!from || warOf(from) || warOf(c)) { mem.challenges.delete(c.id); return { error: "gone" }; }
  if (!eligibleForWar(from) || !eligibleForWar(c)) return { error: "tooSmall", min: CFG.warMinMembers };
  return { war: startWar(from, c) };
};
export const declineWar = (c, by) => {
  if (!canManage(c, by)) return { error: "perm" };
  if (!pendingChallenge(c)) return { error: "none" };
  const ch = mem.challenges.get(c.id); mem.challenges.delete(c.id);
  return { ok: true, from: clansTable()[ch.from] };
};

// Cari lawan otomatis: dua klan yang sama-sama mencari langsung dipasangkan (jumlah anggota terdekat dulu).
export const searchWar = (c, by) => {
  if (!canManage(c, by)) return { error: "perm" };
  if (warOf(c)) return { error: "inWar" };
  if (!eligibleForWar(c)) return { error: "tooSmall", min: CFG.warMinMembers };
  for (const [id, q] of mem.queue) if (q.until < now() || !clansTable()[id] || warOf(clansTable()[id])) mem.queue.delete(id);
  const others = [...mem.queue.keys()].filter((id) => id !== c.id).map((id) => clansTable()[id]).filter((x) => x && eligibleForWar(x))
    .sort((x, y) => Math.abs(size(x) - size(c)) - Math.abs(size(y) - size(c)));
  if (others.length) return { war: startWar(others[0], c), started: true };
  mem.queue.set(c.id, { until: now() + CFG.queueMs });
  return { ok: true, queued: true };
};
export const cancelSearch = (c) => mem.queue.delete(c.id);

// Pertarungan war: penyerang vs snapshot pembela (HP penuh keduanya, penyerang jalan dulu).
export const warFight = (att, def) => {
  let ha = att.maxHp, hd = def.maxHp, turn = 0, rounds = 0;
  while (ha > 0 && hd > 0 && rounds < 200) {
    rounds++;
    const [at, df] = turn ? [def, att] : [att, def];
    let dmg = Math.max(1, Math.round(at.atk * (0.85 + Math.random() * 0.3) - df.def * 0.5));
    if (Math.random() < (at.crit ?? 0.1)) dmg = Math.round(dmg * 1.8);
    if (Math.random() < (df.dodge ?? 0)) dmg = 0;
    if (turn) ha -= dmg; else hd -= dmg;
    turn ^= 1;
  }
  const win = hd <= 0, hpLeft = Math.max(0, ha) / att.maxHp;
  return { win, hpLeft, dmgPct: win ? 1 : 1 - Math.max(0, hd) / def.maxHp, rounds, stars: win ? (hpLeft >= 0.6 ? 3 : hpLeft >= 0.3 ? 2 : 1) : 0 };
};

export const attackWar = (war, clanId, jid, rank) => {
  if (war.state !== "active" || now() > war.end) return { error: "ended" };
  const me = war.rosters[clanId].find((x) => x.jid === jid);
  if (!me) return { error: "notInRoster" };
  if (me.att >= CFG.warAttacks) return { error: "noAttacks" };
  const wait = me.last + CFG.warAttackCd - now();
  if (wait > 0) return { error: "cooldown", ms: wait };
  const foe = war.rosters[foeOf(war, clanId)][rank - 1];
  if (!foe) return { error: "badRank" };
  const r = rpgOf(jid);
  if (!r) return { error: "notInRoster" };
  const res = warFight(game.statsOf(r), foe.stats);
  const gained = Math.max(0, res.stars - foe.stars);
  me.att++; me.last = now();
  foe.stars = Math.max(foe.stars, res.stars); foe.dmg = Math.max(foe.dmg, res.dmgPct);
  const clan = clansTable()[clanId];
  if (clan?.members[jid]) clan.members[jid].stars += gained;
  war.log.unshift({ at: now(), by: me.name, foe: foe.name, stars: res.stars, win: res.win });
  war.log.length = Math.min(war.log.length, 20);
  db.save("settings"); db.save("clans");
  return { ...res, gained, me, foe, left: CFG.warAttacks - me.att };
};

export const warDone = (war) => now() >= war.end || Object.values(war.rosters).every((ros) => ros.every((m) => m.att >= CFG.warAttacks));

export const settleWar = (war, { loser = null } = {}) => {
  const A = clansTable()[war.a], B = clansTable()[war.b];
  war.state = "done";
  const sa = stars(war, war.a), sb = stars(war, war.b), da = destruction(war, war.a), db_ = destruction(war, war.b);
  let winner = loser ? foeOf(war, loser) : sa !== sb ? (sa > sb ? war.a : war.b) : Math.abs(da - db_) > 0.01 ? (da > db_ ? war.a : war.b) : null;
  const payouts = [];
  for (const [clanId, ros] of Object.entries(war.rosters)) {
    const won = winner === clanId, c = clansTable()[clanId];
    for (const m of ros) {
      if (m.att < 1) continue;
      const r = rpgOf(m.jid);
      if (!r) continue;
      const gold = won ? prize() : prize(250, 1000), xp = won ? 120 : 50;
      r.gold += gold; game.xpRows(r, xp);
      const crate = won && Math.random() < 0.3;
      if (crate) game.addItem(r, "petikayu", 1);
      payouts.push({ clanId, jid: m.jid, name: m.name, gold, xp, crate, won });
    }
    if (c) {
      c.war = null;
      if (winner === null) { c.trophies += 5; }
      else if (won) { c.wins++; c.trophies += 30; c.treasury += ros.length * 1000; }
      else { c.losses++; c.trophies = Math.max(0, c.trophies - 15); }
    }
  }
  const mvp = Object.entries(war.rosters).flatMap(([cid, ros]) => ros.map((m) => ({ ...m, cid }))).sort((x, y) => y.att - x.att || y.stars - x.stars);
  war.result = { winner, sa, sb, da, db: db_ };
  if (A) addLog(A, `🏁 War ${winner === null ? "draw" : winner === A.id ? "WIN" : "lost"} ${sa}-${sb}`);
  if (B) addLog(B, `🏁 War ${winner === null ? "draw" : winner === B.id ? "WIN" : "lost"} ${sb}-${sa}`);
  save();
  void mvp;
  return { war, winner, sa, sb, payouts, A, B };
};

export const settleText = (out) => {
  const { war, winner, sa, sb, payouts, A, B } = out;
  const an = A?.name ?? war.a, bn = B?.name ?? war.b;
  const head = winner === null ? tr("🤝 *WAR SERI!*", "🤝 *WAR DRAW!*") : tr(`🏆 *WAR SELESAI* — ${(winner === war.a ? an : bn)} menang!`, `🏆 *WAR OVER* — ${(winner === war.a ? an : bn)} wins!`);
  const lines = [head, `⚔️ ${an}  ⭐${sa}  vs  ⭐${sb}  ${bn}`];
  const top = payouts.filter((p) => p.won).slice(0, 5);
  const pay = (list) => list.map((p) => `• ${p.name}: +${fmt(p.gold)} Gold${p.crate ? " 🎁" : ""}`).join("\n");
  if (top.length) lines.push("", tr("🎁 Hadiah pemenang:", "🎁 Winner rewards:"), pay(top));
  const rest = payouts.filter((p) => !p.won).slice(0, 5);
  if (rest.length) lines.push("", tr("🎖️ Hadiah partisipasi:", "🎖️ Participation rewards:"), pay(rest));
  if (!payouts.length) lines.push("", tr("ℹ️ Tidak ada yang menyerang — tanpa hadiah.", "ℹ️ Nobody attacked — no rewards."));
  return lines.join("\n");
};

// Dipanggil berkala (lib/sched.js) & saat perintah klan: selesaikan war yang waktunya habis / semua serangan terpakai.
export const settleDue = () => {
  const out = [];
  for (const war of Object.values(wars())) {
    if (war.state === "active" && warDone(war)) out.push(settleWar(war));
  }
  // bersihkan war lama (> 3 hari)
  for (const [id, war] of Object.entries(wars())) if (war.state !== "active" && now() - war.end > 3 * 86_400_000) delete wars()[id];
  return out;
};
