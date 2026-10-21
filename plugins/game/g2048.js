import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DAILY, issue, newSeed } from "#lib/gamecodes";
import { ENGINE_SRC, MIN_SCORE } from "#lib/g2048";
import { logger } from "#lib/logger";
import { definePlugin } from "#lib/plugins";
import { sendHtmlApp } from "#lib/richhtml";
import { tr } from "#lib/tr";

/*
 * 🔢 .2048 → game 2048 di rich (sheet). Seed diberikan bot; permainan menghasilkan KODE → kirim `.redeem <kode>`.
 * Bot memutar ulang langkah (lib/g2048.js), menghitung skor sendiri, lalu memberi hadiah:
 * 1 Gold / 12 poin (maks 300) + 1 XP / 50 poin (maks 80) + 2 Diamond bila mencapai ubin 2048.
 * Skor minimal 300 · maks 3 klaim per hari · 1 game = 1 klaim. (.klaim2048 sudah diganti .redeem — berlaku untuk semua game.)
 */
const DEFAULT_IMAGE = "https://raw.githubusercontent.com/Hyro03/logo-ai/main/dino.jpg";

export default definePlugin({
  name: "game2048",
  aliases: ["2048", "main2048"],
  category: "game",
  description: "Play 2048 in rich view — score becomes Gold, XP & Diamond (redeem with the code)",
  async run({ ctx, sock, config, user }) {
    const file = path.join(config.paths.config, "games", "2048.html");
    if (!existsSync(file)) return ctx.reply("❌ File game tidak ditemukan: config/games/2048.html");
    const seed = newSeed();
    const sid = issue("2048", ctx.senderId, { seed });
    const html = readFileSync(file, "utf8").replace("__SEED__", String(seed)).replace("__SID__", sid).replace("/*ENGINE*/", () => ENGINE_SRC);
    const local = path.join(config.paths.config, "games", "2048.jpg");
    try {
      ctx.react("🎮");
      await sendHtmlApp(sock, ctx.chatId, {
        title: "2048 Gold",
        description: tr("Gabungkan ubin, tukar skor jadi hadiah", "Merge tiles, turn your score into rewards"),
        html,
        text: tr(
          `Klik "Lihat perincian" untuk main.\nSelesai? Salin kode → kirim *${ctx.pfx}redeem <kode>* (maks ${DAILY["2048"]}×/hari, skor min ${MIN_SCORE}).`,
          `Tap "Lihat perincian" to play.\nDone? Copy the code → send *${ctx.pfx}redeem <code>* (max ${DAILY["2048"]}×/day, min score ${MIN_SCORE}).`,
        ),
        ...(existsSync(local) ? { image: readFileSync(local) } : { imageUrl: config.games?.g2048?.image ?? DEFAULT_IMAGE }),
        quoted: ctx.raw,
      });
    } catch (err) {
      logger.error(`2048: ${err.stack ?? err.message}`);
      await ctx.reply(`❌ Gagal menjalankan 2048\n\n${err.message}`);
    }
  },
});
