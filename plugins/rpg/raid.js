import { db } from "#lib/database";
import { definePlugin } from "#lib/plugins";
import * as R from "#lib/raid";
import * as game from "#lib/rpg";
import { rememberSock } from "#lib/sched";
import { fmt, tr } from "#lib/tr";
import { numberOf } from "#lib/utils";

/*
 * 👹 .raid — boss bersama satu grup.  .raid [easy|normal|hard] (mulai / status) · .raid attack (alias .hit) · .raid status
 */
const ERR = {
  active: () => tr("👹 Sudah ada boss yang sedang melawan grup ini!", "👹 A boss is already fighting this group!"),
  cooldown: (e) => tr(`⏳ Raid berikutnya bisa dimulai ${Math.ceil(e.ms / 60_000)} menit lagi.`, `⏳ The next raid can start in ${Math.ceil(e.ms / 60_000)} min.`),
  level: (e) => tr(`❌ Butuh level ${e.need} untuk tingkat ini.`, `❌ You need level ${e.need} for this tier.`),
  tier: (_, p) => tr(`❌ Tingkat: easy / normal / hard. Contoh: *${p}raid hard*`, `❌ Tiers: easy / normal / hard. Example: *${p}raid hard*`),
};

export default definePlugin({
  name: "raid",
  aliases: ["boss", "hit"],
  category: "rpg",
  ownHelp: true,
  access: { group: true },
  description: "Group raid boss: everyone attacks the same boss, damage-based random Gold rewards",
  usage: "raid [easy|normal|hard] · raid attack",
  async run(env) {
    const { ctx, sock, user } = env, p = ctx.pfx, chat = ctx.chatId, me = ctx.senderId;
    rememberSock(sock);
    for (const out of R.settleDue()) await sock.sendMessage(out.chat, { text: out.text, mentions: out.mentions }).catch(() => {});
    const r = game.getRpg(user), name = user.reg?.name ?? ctx.pushName ?? numberOf(me);
    const viaHit = ctx.command === "hit";
    const sub = (viaHit ? "attack" : (ctx.args[0] ?? "")).toLowerCase();
    const raid = R.activeRaid(chat);

    if (["attack", "serang", "a", "hit"].includes(sub)) {
      if (!raid) return ctx.reply(tr(`👹 Belum ada boss. Mulai: *${p}raid [easy|normal|hard]*`, `👹 No boss yet. Start one: *${p}raid [easy|normal|hard]*`));
      const res = R.hitRaid(chat, me, name, r);
      if (res.error === "cooldown") return ctx.reply(tr(`⏳ Tunggu ${Math.ceil(res.ms / 1000)} detik lagi.`, `⏳ Wait ${Math.ceil(res.ms / 1000)} more seconds.`));
      if (res.error === "stamina") return ctx.reply(tr(`⚡ Stamina kurang (butuh ${res.need}). Istirahat atau pakai ramuan: *${p}use energi*`, `⚡ Not enough stamina (need ${res.need}). Rest or use a potion: *${p}use energi*`));
      if (res.error === "hp") return ctx.reply(tr(`❤️ HP terlalu rendah! Pulihkan dulu: *${p}use potionhp*`, `❤️ HP too low! Heal first: *${p}use potionhp*`));
      if (res.error === "expired" || res.error === "none") return ctx.reply(tr("⌛ Raid sudah berakhir.", "⌛ The raid is over."));
      const b = res.raid.boss;
      const lines = [tr(`⚔️ @${numberOf(me)} menyerang *${b.name}*: *${fmt(res.dmg)}* damage${res.crits ? ` 💥×${res.crits}` : ""}`, `⚔️ @${numberOf(me)} hit *${b.name}* for *${fmt(res.dmg)}* damage${res.crits ? ` 💥×${res.crits}` : ""}`), `🩸 ${tr("HP-mu", "Your HP")} -${fmt(res.loss)} → ${fmt(r.hp)}`];
      if (!res.killed) lines.push(`❤️ ${R.bar(b.hp, b.maxHp)} ${fmt(b.hp)}/${fmt(b.maxHp)}`);
      await ctx.reply(lines.join("\n"), { mentions: [me] });
      if (res.killed) await sock.sendMessage(chat, { text: res.final.text, mentions: res.final.mentions });
      return undefined;
    }

    if (["status", "info", ""].includes(sub) && raid) {
      const s = R.statusText(raid, p);
      return ctx.reply(s.text, { mentions: s.mentions });
    }

    // mulai raid baru (tingkat opsional)
    const tier = ["easy", "normal", "hard"].includes(sub) ? sub : sub === "" || sub === "start" || sub === "mulai" ? (ctx.args[1] ?? "normal").toLowerCase() : null;
    if (!tier) return ctx.reply(tr(`❓ Pakai: *${p}raid [easy|normal|hard]* · *${p}raid attack* · *${p}raid status*`, `❓ Use: *${p}raid [easy|normal|hard]* · *${p}raid attack* · *${p}raid status*`));
    const res = R.startRaid(chat, me, name, r, tier);
    if (res.error) return ctx.reply(ERR[res.error](res, p));
    const t = R.TIERS[tier], b = res.raid.boss;
    return ctx.reply(tr(
      `${b.icon} *RAID BOSS MUNCUL!*\n*${b.name}* (${t.en}) menyerang grup ini!\n❤️ HP ${fmt(b.maxHp)} · 🗡️ ${b.atk} · 🛡️ ${b.def}\n⏳ ${R.CFG.ms / 60_000} menit\n\nSemua boleh ikut: *${p}raid attack* (alias *${p}hit*)\n🎁 Boss kalah = semua yang ikut dapat ${t.gold[0]}–${t.gold[1]} Gold (acak) + XP; MVP & last-hit dapat peti!`,
      `${b.icon} *RAID BOSS APPEARS!*\n*${b.name}* (${t.en}) is attacking this group!\n❤️ HP ${fmt(b.maxHp)} · 🗡️ ${b.atk} · 🛡️ ${b.def}\n⏳ ${R.CFG.ms / 60_000} minutes\n\nEveryone can join: *${p}raid attack* (alias *${p}hit*)\n🎁 Defeat it and everyone who joined gets ${t.gold[0]}–${t.gold[1]} Gold (random) + XP; MVP & last hit get crates!`,
    ));
    void user; void db;
  },
});
