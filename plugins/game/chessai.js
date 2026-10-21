import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { CHESS_LEVELS, DAILY, chessProgress, issue, newSeed } from "#lib/gamecodes";
import { engineSource } from "#lib/gameengine";
import { logger } from "#lib/logger";
import { definePlugin } from "#lib/plugins";
import { sendHtmlApp } from "#lib/richhtml";
import { tr } from "#lib/tr";
import { currentLang } from "#lib/i18n";

/*
 * ♟️ .chessai → catur SINGLE PLAYER lawan AI di rich (sheet), 8 level kesulitan, hadiah di setiap level.
 *   Papan & AI berjalan di sheet (config/games/engine/chess-ai.js). Selesai → salin kode → `.redeem <kode>`.
 *   Bot memutar ulang seluruh permainan dengan mesin yang sama (termasuk tiap langkah AI) sebelum memberi hadiah.
 *   Menang = hadiah level · remis = 35% · bonus sekali untuk clear pertama tiap level · maks 10 klaim/hari.
 */
const firstText = (L) => {
  if (!L.first) return "";
  const bits = [];
  if (L.first.diamond) bits.push(`💎 ${L.first.diamond}`);
  if (L.first.limit) bits.push(`🎟️ ${L.first.limit}`);
  for (const [id, n] of Object.entries(L.first.items ?? {})) bits.push(`🎁 ${id} x${n}`);
  return `🪙 +${L.gold * 2}${bits.length ? ` · ${bits.join(" · ")}` : ""}`;
};

export default definePlugin({
  name: "chessai",
  aliases: ["caturai", "vsai", "chessbot", "catursolo"],
  category: "game",
  description: "Single-player chess vs AI in rich view — 8 difficulty levels, reward on every level",
  async run({ ctx, sock, config, user }) {
    const file = path.join(config.paths.config, "games", "chess-ai.html");
    if (!existsSync(file)) return ctx.reply("❌ File game tidak ditemukan: config/games/chess-ai.html");
    const prog = chessProgress(user);
    const cleared = Object.keys(prog.cleared).map(Number);
    const seed = newSeed();
    const sid = issue("chessai", ctx.senderId, { seed });
    const cfg = {
      sid, seed, lang: currentLang(), cleared,
      next: Math.min(8, Math.max(1, ...cleared) + (cleared.length ? 1 : 0)),
      levels: CHESS_LEVELS.map((L) => L && { name: L.name, gold: L.gold, xp: L.xp, diamond: L.diamond ?? 0, first: firstText(L) }),
    };
    const html = readFileSync(file, "utf8")
      .replace("/*ENGINE*/", () => engineSource("chess-ai"))
      .replace("__CFG__", () => JSON.stringify(cfg).replace(/</g, "\\u003c"));
    const local = path.join(config.paths.config, "games", "chess-ai.jpg");
    try {
      ctx.react("♟️");
      await sendHtmlApp(sock, ctx.chatId, {
        title: tr("Catur vs AI", "Chess vs AI"),
        description: tr("Lawan AI, hadiah di setiap level", "Beat the AI, rewards on every level"),
        html,
        text: tr(
          `Klik "Lihat perincian" → pilih level (1–8) & warna.\nMenang = hadiah level, bonus clear pertama! Selesai → salin kode → *${ctx.pfx}redeem <kode>* (maks ${DAILY.chessai}×/hari).`,
          `Tap "Lihat perincian" → pick a level (1–8) & color.\nWin = level reward + first-clear bonus! When done copy the code → *${ctx.pfx}redeem <code>* (max ${DAILY.chessai}×/day).`,
        ),
        ...(existsSync(local) ? { image: readFileSync(local) } : {}),
        quoted: ctx.raw,
      });
    } catch (err) {
      logger.error(`chessai: ${err.stack ?? err.message}`);
      await ctx.reply(`❌ Gagal menjalankan Catur vs AI\n\n${err.message}`);
    }
  },
});
