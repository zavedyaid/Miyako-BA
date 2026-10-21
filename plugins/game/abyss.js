import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DAILY, issue, newSeed } from "#lib/gamecodes";
import { engineSource } from "#lib/gameengine";
import { currentLang } from "#lib/i18n";
import { logger } from "#lib/logger";
import { definePlugin } from "#lib/plugins";
import { getRpg, statsOf } from "#lib/rpg";
import { sendHtmlApp } from "#lib/richhtml";
import { tr } from "#lib/tr";

/*
 * ⚔️ .abyss → Miyako Abyss: dungeon roguelike 10 lantai di rich (sheet) — 3 kelas, 3 kesulitan, skill, jaga, ramuan,
 * boss tiap 5 lantai, kartu relik, toko antar lantai, animasi serangan. Kekuatan dasar mengikuti RPG-mu (level, senjata, zirah).
 * Selesai / berhenti → salin kode → `.redeem <kode>`; bot memutar ulang run-mu (config/games/engine/abyss.js) lalu memberi hadiah:
 * Gold, XP, Diamond, peti, dan Limit bila menang. Maks 6 klaim/hari.
 */
export default definePlugin({
  name: "abyss",
  aliases: ["miyakoabyss", "dungeonrun", "menara"],
  category: "game",
  description: "Miyako Abyss — 10-floor dungeon roguelike in rich view (classes, skills, relics, bosses) with rewards",
  async run({ ctx, sock, config, user }) {
    const file = path.join(config.paths.config, "games", "abyss.html");
    if (!existsSync(file)) return ctx.reply("❌ File game tidak ditemukan: config/games/abyss.html");
    const st = statsOf(getRpg(user));
    const cfg = { seed: newSeed(), hp: st.maxHp, atk: st.atk, def: st.def };
    const sid = issue("abyss", ctx.senderId, { cfg });
    const html = readFileSync(file, "utf8")
      .replace("/*ENGINE*/", () => engineSource("abyss"))
      .replace("__CFG__", () => JSON.stringify({ ...cfg, sid, lang: currentLang() }));
    const local = path.join(config.paths.config, "games", "abyss.jpg");
    try {
      ctx.react("⚔️");
      await sendHtmlApp(sock, ctx.chatId, {
        title: "Miyako Abyss",
        description: tr("Dungeon 10 lantai — boss, relik, hadiah", "10-floor dungeon — bosses, relics, rewards"),
        html,
        text: tr(
          `Klik "Lihat perincian" untuk turun ke Abyss.\nKekuatan awalmu mengikuti RPG-mu (Lv ${getRpg(user).lvl}). Selesai → salin kode → *${ctx.pfx}redeem <kode>* (maks ${DAILY.abyss}×/hari).`,
          `Tap "Lihat perincian" to descend into the Abyss.\nYour starting power follows your RPG (Lv ${getRpg(user).lvl}). When done copy the code → *${ctx.pfx}redeem <code>* (max ${DAILY.abyss}×/day).`,
        ),
        ...(existsSync(local) ? { image: readFileSync(local) } : {}),
        quoted: ctx.raw,
      });
    } catch (err) {
      logger.error(`abyss: ${err.stack ?? err.message}`);
      await ctx.reply(`❌ Gagal menjalankan Miyako Abyss\n\n${err.message}`);
    }
  },
});
