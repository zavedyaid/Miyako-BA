import { definePlugin } from "#lib/plugins";
import { db } from "#lib/database";
import { MAX_LEVEL } from "#lib/levels";
import { ITEMS, STAMINA_MAX, addItem, bankCap, getRpg, statsOf } from "#lib/rpg";
import { tr, fmt } from "#lib/tr";
import { numberOf } from "#lib/utils";

/*
 * .cheat [@tag] [apa] — mode curang (khusus owner), untuk diri sendiri atau pemain yang di-tag / di-reply.
 *   all (bawaan) · level · gold · diamond · inv · limit · premium · stamina · reset
 *   level  → level bot MAKS (config/levels.json) + level RPG MAKS (100), HP penuh
 *   gold   → 999.999.999 Gold di dompet + bank terisi penuh
 *   inv    → inventory FULL: semua item x99 (kartu unik x1), senjata & zirah terbaik terpasang
 */
export const RPG_MAX_LEVEL = 100;
const BIG = 999_999_999;

const ACTIONS = {
  level: (u, r) => {
    u.level = MAX_LEVEL; u.exp = 0;
    r.lvl = RPG_MAX_LEVEL; r.xp = 0; r.hp = statsOf(r).maxHp;
    return tr(`📈 Level bot ${MAX_LEVEL} · Level RPG ${RPG_MAX_LEVEL}`, `📈 Bot level ${MAX_LEVEL} · RPG level ${RPG_MAX_LEVEL}`);
  },
  gold: (u, r) => { r.gold = BIG; r.bank = Math.max(r.bank, bankCap(r)); return `🪙 Gold ${fmt(r.gold)} · 🏦 ${fmt(r.bank)}`; },
  diamond: (u, r) => { r.diamond = Math.max(r.diamond, 99_999); return `💎 Diamond ${fmt(r.diamond)}`; },
  inv: (u, r) => {
    for (const [id, it] of Object.entries(ITEMS)) r.inv[id] = Math.max(r.inv[id] ?? 0, it.unique ? 1 : 99);
    r.equip.weapon = "pedangnaga"; r.equip.armor = "zirahnaga";
    return tr(`🎒 Inventory penuh (${Object.keys(ITEMS).length} jenis item, x99) · pedang & zirah naga terpasang`, `🎒 Inventory full (${Object.keys(ITEMS).length} item types, x99) · dragon sword & armor equipped`);
  },
  limit: (u) => { u.limit = 999_999; return `🎟️ Limit ${fmt(u.limit)}`; },
  premium: (u) => { u.premium = { on: true, expiredAt: 0 }; return tr("👑 Premium permanen", "👑 Permanent premium"); },
  stamina: (u, r) => { r.stamina = STAMINA_MAX; r.hp = statsOf(r).maxHp; r.t = Date.now(); return `⚡ Stamina ${STAMINA_MAX} · ❤️ HP ${r.hp}`; },
};
const ORDER = ["level", "gold", "diamond", "inv", "limit", "premium", "stamina"];

export default definePlugin({
  name: "cheat",
  aliases: ["curang", "maxall", "godmode"],
  category: "owner",
  access: { owner: true },
  description: "Cheat mode: max level, tons of gold, full inventory, etc. (owner only)",
  usage: "cheat [@tag] [all|level|gold|diamond|inv|limit|premium|stamina|reset]",
  async run({ ctx }) {
    const p = ctx.pfx;
    const targetId = ctx.mentionedJid[0] ?? ctx.quotedSender ?? ctx.senderId;
    const what = (ctx.args.find((a) => !a.startsWith("@")) ?? "all").toLowerCase();
    const user = db.user(targetId);

    if (what === "reset") {
      user.rpg = null; user.level = 1; user.exp = 0; user.limit = db.settings.limitDefault ?? 25; user.premium = { on: false, expiredAt: 0 };
      db.save("users");
      return ctx.reply(tr(`♻️ Data RPG & level @${numberOf(targetId)} direset.`, `♻️ Reset RPG data & level for @${numberOf(targetId)}.`), { mentions: [targetId] });
    }
    const keys = what === "all" ? ORDER : ORDER.filter((k) => k === what);
    if (!keys.length) return ctx.reply(tr(`🕹️ *CHEAT*\n*${p}cheat* [@tag] [${["all", ...ORDER, "reset"].join("|")}]`, `🕹️ *CHEAT*\n*${p}cheat* [@tag] [${["all", ...ORDER, "reset"].join("|")}]`));

    const r = getRpg(user);
    const lines = keys.map((k) => ACTIONS[k](user, r));
    db.save("users");
    await ctx.reply([`🕹️ *CHEAT* → @${numberOf(targetId)}`, ...lines].join("\n"), { mentions: [targetId] });
  },
});
