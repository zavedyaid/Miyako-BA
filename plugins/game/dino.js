import { existsSync, readFileSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { DAILY, DINO_MIN, issue } from "#lib/gamecodes";
import { definePlugin } from "#lib/plugins";
import { sendHtmlApp } from "#lib/richhtml";
import { logger } from "#lib/logger";
import { tr } from "#lib/tr";

/*
 * .dino → Hyrox Dino Runner (rich). Setiap run yang selesai menghasilkan KODE hadiah → kirim `.redeem <kode>`.
 *   HTML game  : config/games/dino.html          Thumbnail: config/games/dino.jpg (dibuat tools/make-dino-banner.py)
 * Dino tidak bisa diputar ulang seperti 2048, jadi kodenya ditandatangani kunci sesi & skornya dibatasi terhadap
 * waktu nyata (lihat lib/gamecodes.js). Hadiah dibatasi per hari.
 */
export default definePlugin({
  name: "dino",
  aliases: ["hyroxdino", "dinorunner"],
  category: "game",
  description: "Play Hyrox Dino Runner — score becomes Gold, XP & Diamond (redeem with the code)",
  async run({ ctx, sock, config }) {
    const dir = path.join(config.paths.config, "games");
    const htmlFile = path.join(dir, "dino.html");
    if (!existsSync(htmlFile)) return ctx.reply("❌ File game tidak ditemukan: config/games/dino.html");

    const key = crypto.randomBytes(6).toString("hex");
    const sid = issue("dino", ctx.senderId, { key });
    const html = readFileSync(htmlFile, "utf8").replace("__SID__", sid).replace("__KEY__", key);
    const localImage = path.join(dir, "dino.jpg");
    try {
      ctx.react("🎮");
      await sendHtmlApp(sock, ctx.chatId, {
        title: "Hyrox Dino Runner",
        description: tr("Lompat, hindari, raih hadiah", "Jump, dodge, win rewards"),
        html,
        text: tr(
          `Klik "Lihat perincian" untuk main.\nSkor ≥ ${DINO_MIN}? Salin kode di bawah game → kirim *${ctx.pfx}redeem <kode>* (maks ${DAILY.dino}×/hari).`,
          `Tap "Lihat perincian" to play.\nScore ≥ ${DINO_MIN}? Copy the code under the game → send *${ctx.pfx}redeem <code>* (max ${DAILY.dino}×/day).`,
        ),
        ...(existsSync(localImage) ? { image: readFileSync(localImage) } : { imageUrl: config.games?.dino?.image }),
        quoted: ctx.raw,
      });
    } catch (err) {
      logger.error(`dino: ${err.stack ?? err.message}`);
      await ctx.reply(`❌ Gagal menjalankan Hyrox Dino Runner\n\n${err.message}`);
    }
  },
});
