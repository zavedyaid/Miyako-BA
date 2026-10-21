import { definePlugin } from "#lib/plugins";
import { db } from "#lib/database";
import { redeemGameCode } from "#lib/gamecodes";
import { describe, grant, redeemAdminCode } from "#lib/redeem";
import { tr } from "#lib/tr";

/*
 * .redeem <kode> — tukar kode jadi hadiah. Satu pintu untuk:
 *   • kode dari game (2048, Dino, Abyss, Catur vs AI) — bentuk: 48~… · dino~… · aby~… · chs~…
 *   • kode hadiah dari admin (.createredeem) — mis. MIYAKO-ABCD1234
 */
export default definePlugin({
  name: "redeem",
  aliases: ["klaim", "tukar", "claimcode", "kode"],
  category: "game",
  description: "Redeem a code: game rewards (2048, Dino, Abyss, Chess vs AI) & admin gift codes",
  usage: "redeem <kode>",
  async run({ ctx, user }) {
    const code = ctx.args.join("").trim();
    if (!code) {
      return ctx.reply(tr(
        `🎁 *REDEEM*\nKirim: *${ctx.pfx}redeem <kode>*\n\n• Kode game (2048, Dino, Abyss, Catur vs AI) → salin dari dalam game setelah selesai.\n• Kode hadiah admin → dibagikan admin/event.`,
        `🎁 *REDEEM*\nSend: *${ctx.pfx}redeem <code>*\n\n• Game codes (2048, Dino, Abyss, Chess vs AI) → copy them inside the game when you finish.\n• Admin gift codes → shared by the admin / events.`,
      ));
    }

    // kode game (diverifikasi ulang di bot)
    if (code.includes("~")) {
      ctx.react?.("⏳");
      const res = await redeemGameCode(user, ctx.senderId, code);
      if (!res) return ctx.reply(tr("❌ Kode tidak dikenali.", "❌ Unrecognized code."));
      if (!res.ok) return ctx.reply(`❌ ${res.error}`);
      const lines = Object.keys(res.rewards).length ? grant(user, res.rewards) : [];
      db.save("users");
      return ctx.reply([`*${res.title}*`, ...res.rows, "", ...(lines.length ? [tr("🎁 *Hadiah*", "🎁 *Rewards*"), ...lines] : [])].join("\n").trim());
    }

    // kode admin
    const res = redeemAdminCode(user, ctx.senderId, code);
    if (!res.ok) return ctx.reply(`❌ ${res.error}`);
    await ctx.reply([tr("🎁 *REDEEM BERHASIL*", "🎁 *REDEEM SUCCESS*"), `*${res.entry.code}*${res.entry.note ? ` — ${res.entry.note}` : ""}`, "", ...res.lines].join("\n"));
  },
});
