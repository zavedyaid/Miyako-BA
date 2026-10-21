import { definePlugin } from "#lib/plugins";
import { cardPayload, checkCards, fetchAvatar, renderCard } from "#lib/cards";
import { db } from "#lib/database";
import { t as tl } from "#lib/i18n";

/*
 * Uji kartu welcome / goodbye / level-up memakai data kamu sendiri — berguna bila kartu tidak muncul.
 *   .cardtest welcome|goodbye|levelup   → kirim kartu dengan gaya aktif (.set owner cardstyle)
 * Bila gagal, alasan lengkapnya ditampilkan di sini (ffmpeg / font / aset / pengiriman).
 */
const KINDS = ["welcome", "goodbye", "levelup"];

export default definePlugin({
  name: "cardtest",
  aliases: ["testcard", "tescard"],
  category: "owner",
  description: "Uji kartu welcome / goodbye / level-up dan tampilkan error-nya",
  usage: "cardtest <welcome|goodbye|levelup>",
  access: { owner: true },
  async run({ sock, ctx, group }) {
    const kind = (ctx.args[0] ?? "welcome").toLowerCase();
    if (!KINDS.includes(kind)) return ctx.reply(tl("own.cardtest.1", { v: KINDS.join(", "), prefix: ctx.pfx }));

    const env = await checkCards();
    if (!env.ok) return ctx.reply(tl("own.cardtest.2", { reason: env.reason }), { preview: false });

    ctx.react("⏳");
    const meta = ctx.isGroup ? (await group().catch(() => ({}))).meta : null;
    const data = { name: ctx.pushName || ctx.senderNumber, group: meta?.subject ?? "Grup Contoh", count: meta?.participants?.length ?? 100, avatar: await fetchAvatar(sock, ctx.senderId) };

    let card;
    try {
      card = await renderCard(kind, { ...data, oldLevel: 12, newLevel: 13, ratio: 0.42 });
    } catch (err) {
      ctx.react("❌");
      return ctx.reply(tl("own.cardtest.3", { message: err.message }), { preview: false });
    }

    const style = db.settings.cardStyle ?? "preview";
    const text = `🧪 Tes kartu *${kind}* — gaya: *${style}*${data.avatar ? "" : "\nℹ️ Foto profil tidak terbaca (dipakai tanpa foto)."}`;
    try {
      await sock.sendMessage(ctx.chatId, cardPayload(card, { text, mentions: [], title: `🧪 ${kind}`, body: data.group, style }));
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      await ctx.reply(tl("own.cardtest.4", { style, message: err.message, prefix: ctx.pfx, v: style === "preview" ? "image" : "preview" }), { preview: false });
    }
  },
});
