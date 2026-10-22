import { definePlugin } from "#lib/plugins";
import * as game from "#lib/rpg";
import { fmt, tr } from "#lib/tr";

/*
 * 🎭 .class — pilih kelas karakter (pengali HP/ATK/DEF + crit/dodge, berlaku di semua pertarungan: hunt, duel, raid, war).
 *   Pertama kali GRATIS (Lv 3+); ganti kelas berbayar CHANGE_COST Gold.
 */
const MIN_LEVEL = 3, CHANGE_COST = 2000;
const pct = (v) => `${v >= 1 ? "+" : ""}${Math.round((v - 1) * 100)}%`;
const row = (k) => { const c = game.CLASSES[k]; return `${c.icon} *${c.name}* (${k}) — HP ${pct(c.hp)} · ATK ${pct(c.atk)} · DEF ${pct(c.def)} · crit ${Math.round(c.crit * 100)}%${c.dodge ? ` · dodge ${Math.round(c.dodge * 100)}%` : ""}\n   _${tr(c.id, c.en)}_`; };

export default definePlugin({
  name: "class",
  aliases: ["kelas", "job"],
  category: "rpg",
  description: "Choose a character class (stat multipliers apply in every fight)",
  usage: "class [warrior|mage|archer|rogue|cleric]",
  async run(env) {
    const { ctx, user } = env, p = ctx.pfx, r = game.getRpg(user);
    const want = (ctx.args[0] ?? "").toLowerCase();
    const cur = game.CLASSES[r.cls];
    if (!want) {
      return ctx.reply([`🎭 *${tr("KELAS KARAKTER", "CHARACTER CLASS")}*${cur ? `\n${tr("Kelasmu", "Your class")}: ${cur.icon} *${cur.name}*` : ""}`, "", ...Object.keys(game.CLASSES).map(row), "", tr(`Pilih: *${p}class <nama>* (Lv ${MIN_LEVEL}+, gratis pertama kali · ganti ${fmt(CHANGE_COST)} Gold)`, `Choose: *${p}class <name>* (Lv ${MIN_LEVEL}+, first pick free · changing costs ${fmt(CHANGE_COST)} Gold)`)].join("\n"));
    }
    if (!game.CLASSES[want]) return ctx.reply(tr(`❌ Kelas tidak ada. Pilihan: ${Object.keys(game.CLASSES).join(", ")}`, `❌ Unknown class. Options: ${Object.keys(game.CLASSES).join(", ")}`));
    if (r.lvl < MIN_LEVEL) return ctx.reply(tr(`❌ Butuh level ${MIN_LEVEL} untuk memilih kelas.`, `❌ You need level ${MIN_LEVEL} to pick a class.`));
    if (r.cls === want) return ctx.reply(tr("😅 Itu sudah kelasmu.", "😅 That's already your class."));
    if (r.cls) {
      if (r.gold < CHANGE_COST) return ctx.reply(tr(`💰 Ganti kelas butuh ${fmt(CHANGE_COST)} Gold di dompet.`, `💰 Changing class costs ${fmt(CHANGE_COST)} Gold in your wallet.`));
      r.gold -= CHANGE_COST;
    }
    r.cls = want;
    env.db.save("users");
    const st = game.statsOf(r);
    return ctx.reply(tr(`🎭 Kamu sekarang *${game.CLASSES[want].name}* ${game.CLASSES[want].icon}\n❤️ ${st.maxHp} · 🗡️ ${st.atk} · 🛡️ ${st.def} · 💥 ${Math.round(st.crit * 100)}%`, `🎭 You are now a *${game.CLASSES[want].name}* ${game.CLASSES[want].icon}\n❤️ ${st.maxHp} · 🗡️ ${st.atk} · 🛡️ ${st.def} · 💥 ${Math.round(st.crit * 100)}%`));
  },
});
