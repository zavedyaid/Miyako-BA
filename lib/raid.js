import { db } from "#lib/database";
import { prize } from "#lib/prize";
import * as game from "#lib/rpg";
import { fmt, tr } from "#lib/tr";
import { numberOf, pick } from "#lib/utils";

/*
 * 👹 RAID BOSS GRUP — satu boss bersama untuk semua orang di grup. Tiap pemain boleh menyerang berkali-kali (jeda, stamina, HP terpakai);
 * damage dijumlahkan. Boss kalah sebelum waktu habis → semua yang ikut dapat Gold ACAK (rentang sesuai tingkat) + XP, MVP & last-hit dapat peti.
 * Data: db.settings.raids[chatJid]. Penyelesaian (waktu habis) lewat lib/sched.js · settleDue().
 */
export const CFG = { ms: 90 * 60_000, cd: 120_000, stamina: 6, minHpPct: 0.2, groupCd: 20 * 60_000, minLevel: 3 };
export const TIERS = {
  easy: { icon: "👺", names: ["Raja Goblin", "Slime Raksasa", "Serigala Hutan"], hp: 1, atk: 1, gold: [500, 1000], lvl: 3, en: "Easy" },
  normal: { icon: "🐲", names: ["Naga Muda", "Troll Gunung", "Golem Batu"], hp: 1.6, atk: 1.5, gold: [800, 1600], lvl: 8, en: "Normal" },
  hard: { icon: "👹", names: ["Iblis Jurang", "Raja Lich", "Hydra Kuno"], hp: 3.2, atk: 2.2, gold: [1200, 2000], lvl: 15, en: "Hard" },
};
const now = () => Date.now();
const raids = () => (db.settings.raids ??= {});
export const raidOf = (chat) => raids()[chat] ?? null;
export const activeRaid = (chat) => { const r = raidOf(chat); return r?.state === "active" ? r : null; };
export const bar = (hp, max, n = 12) => { const f = Math.max(0, Math.min(n, Math.round((hp / max) * n))); return "█".repeat(f) + "░".repeat(n - f); };

export const startRaid = (chat, jid, name, r, tierName = "normal") => {
  const tier = TIERS[tierName];
  if (!tier) return { error: "tier" };
  if (activeRaid(chat)) return { error: "active" };
  const prev = raidOf(chat);
  if (prev?.cdUntil > now()) return { error: "cooldown", ms: prev.cdUntil - now() };
  if (r.lvl < Math.max(CFG.minLevel, tier.lvl)) return { error: "level", need: Math.max(CFG.minLevel, tier.lvl) };
  const L = Math.max(5, r.lvl);
  const hp = Math.round((1200 + L * 350) * tier.hp);
  const raid = {
    chat, state: "active", tier: tierName, start: now(), end: now() + CFG.ms, starter: jid, last: null, cd: {}, dmg: {}, cdUntil: 0,
    boss: { name: pick(tier.names), icon: tier.icon, hp, maxHp: hp, atk: Math.round((12 + L * 1.5) * tier.atk), def: Math.round(5 + L * 1.2) },
  };
  raids()[chat] = raid;
  db.save("settings");
  return { raid, by: name };
};

// Satu serangan: 5 ronde damage ke boss, boss membalas 3 ronde. → { error } | { dmg, loss, killed, raid, ... }
export const hitRaid = (chat, jid, name, r) => {
  const raid = activeRaid(chat);
  if (!raid) return { error: "none" };
  if (now() > raid.end) return { error: "expired" };
  const wait = (raid.cd[jid] ?? 0) + CFG.cd - now();
  if (wait > 0) return { error: "cooldown", ms: wait };
  const st = game.statsOf(r);
  if (r.stamina < CFG.stamina) return { error: "stamina", need: CFG.stamina };
  if (r.hp < st.maxHp * CFG.minHpPct) return { error: "hp" };
  const boss = raid.boss;
  let dmg = 0, crits = 0;
  for (let i = 0; i < 5; i++) {
    let d = Math.max(1, Math.round(st.atk * (0.85 + Math.random() * 0.3) - boss.def * 0.5));
    if (Math.random() < st.crit) { d = Math.round(d * 1.8); crits++; }
    dmg += d;
  }
  let loss = 0;
  for (let i = 0; i < 3; i++) {
    if (Math.random() < st.dodge) continue;
    loss += Math.max(1, Math.round(boss.atk * (0.85 + Math.random() * 0.3) - st.def * 0.6));
  }
  r.stamina -= CFG.stamina;
  r.hp = Math.max(1, r.hp - loss);
  boss.hp = Math.max(0, boss.hp - dmg);
  raid.cd[jid] = now();
  const e = (raid.dmg[jid] ??= { name, dmg: 0, hits: 0 });
  e.name = name; e.dmg += dmg; e.hits++;
  raid.last = jid;
  const killed = boss.hp <= 0;
  const out = { dmg, loss, crits, killed, raid };
  if (killed) out.final = finishRaid(raid, true);
  db.save("settings"); db.save("users");
  return out;
};

export const ranking = (raid) => Object.entries(raid.dmg).map(([jid, e]) => ({ jid, ...e })).sort((a, b) => b.dmg - a.dmg);

// Kalah/menang → bagi hadiah (hanya bila boss kalah). → { text, mentions, payouts }
const finishRaid = (raid, win) => {
  raid.state = win ? "done" : "failed";
  raid.cdUntil = now() + CFG.groupCd;
  const rank = ranking(raid), total = rank.reduce((s, x) => s + x.dmg, 0) || 1, tier = TIERS[raid.tier];
  const payouts = [];
  if (win) {
    rank.forEach((x, i) => {
      const u = db.users[x.jid];
      if (!u) return;
      const r = game.getRpg(u), share = x.dmg / total;
      const gold = prize(...tier.gold), xp = Math.round(60 + share * 400);
      r.gold += gold; game.xpRows(r, xp);
      let crate = null;
      if (i === 0) { crate = "petiemas"; game.addItem(r, crate, 1); }
      else if (x.jid === raid.last) { crate = "petikayu"; game.addItem(r, crate, 1); }
      payouts.push({ ...x, gold, xp, crate, share, mvp: i === 0, lastHit: x.jid === raid.last });
    });
  }
  const lines = win
    ? [tr(`🏆 *${raid.boss.icon} ${raid.boss.name} TUMBANG!*`, `🏆 *${raid.boss.icon} ${raid.boss.name} DEFEATED!*`), "", ...payouts.slice(0, 8).map((p, i) => `${i + 1}. @${numberOf(p.jid)} — ${fmt(p.dmg)} dmg (${Math.round(p.share * 100)}%) → +${fmt(p.gold)} Gold${p.crate ? ` · 🎁 ${game.ITEMS[p.crate].name}` : ""}${p.mvp ? " 👑" : ""}${p.lastHit ? " 🎯" : ""}`), ...(payouts.length > 8 ? [tr(`…dan ${payouts.length - 8} pemain lain juga dapat hadiah.`, `…and ${payouts.length - 8} more players got rewards.`)] : []), "", tr("👑 MVP (damage terbesar) · 🎯 last hit", "👑 MVP (top damage) · 🎯 last hit")]
    : [tr(`💀 *${raid.boss.icon} ${raid.boss.name}* kabur — waktu habis! Sisa HP ${fmt(raid.boss.hp)}/${fmt(raid.boss.maxHp)}.`, `💀 *${raid.boss.icon} ${raid.boss.name}* escaped — time's up! HP left ${fmt(raid.boss.hp)}/${fmt(raid.boss.maxHp)}.`)];
  db.save("users"); db.save("settings");
  return { text: lines.join("\n"), mentions: rank.map((x) => x.jid), payouts, chat: raid.chat };
};

export const settleDue = () => {
  const out = [];
  for (const raid of Object.values(raids())) if (raid.state === "active" && now() > raid.end) out.push(finishRaid(raid, false));
  return out;
};

export const statusText = (raid, p = ".") => {
  const b = raid.boss, left = Math.max(0, raid.end - now()), top = ranking(raid).slice(0, 5);
  const lines = [
    `${b.icon} *${b.name}* — ${tr("Raid", "Raid")} ${TIERS[raid.tier].en}`,
    `❤️ ${bar(b.hp, b.maxHp)} ${fmt(b.hp)}/${fmt(b.maxHp)}`,
    `⏳ ${Math.floor(left / 60_000)} ${tr("mnt", "min")} · 🗡️ ATK ${b.atk} · 🛡️ DEF ${b.def}`,
  ];
  if (top.length) lines.push("", `🏅 ${tr("Damage terbesar", "Top damage")}:`, ...top.map((x, i) => `${i + 1}. @${numberOf(x.jid)} — ${fmt(x.dmg)} (${x.hits}×)`));
  lines.push("", tr(`Serang: *${p}raid attack* (jeda ${CFG.cd / 1000}s · ${CFG.stamina} stamina)`, `Attack: *${p}raid attack* (${CFG.cd / 1000}s cooldown · ${CFG.stamina} stamina)`));
  return { text: lines.join("\n"), mentions: top.map((x) => x.jid) };
};
