import { definePlugin } from "#lib/plugins";
import { cardPayload, checkCards, fetchAvatar, renderCard } from "#lib/cards";
import { db } from "#lib/database";

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
    if (!KINDS.includes(kind)) return ctx.reply(`❌ Pilih: ${KINDS.join(", ")}\nContoh: *${ctx.prefix}cardtest welcome*`);

    const env = await checkCards();
    if (!env.ok) return ctx.reply(`❌ Kartu tidak bisa dirender di server ini:\n${env.reason}`, { preview: false });

    ctx.react("⏳");
    const meta = ctx.isGroup ? (await group().catch(() => ({}))).meta : null;
    const data = { name: ctx.pushName || ctx.senderNumber, group: meta?.subject ?? "Grup Contoh", count: meta?.participants?.length ?? 100, avatar: await fetchAvatar(sock, ctx.senderId) };

    let card;
    try {
      card = await renderCard(kind, { ...data, oldLevel: 12, newLevel: 13, ratio: 0.42 });
    } catch (err) {
      ctx.react("❌");
      return ctx.reply(`❌ Render gagal:\n${err.message}`, { preview: false });
    }

    const style = db.settings.cardStyle ?? "preview";
    const text = `🧪 Tes kartu *${kind}* — gaya: *${style}*${data.avatar ? "" : "\nℹ️ Foto profil tidak terbaca (dipakai tanpa foto)."}`;
    try {
      await sock.sendMessage(ctx.chatId, cardPayload(card, { text, mentions: [], title: `🧪 ${kind}`, body: data.group, style }));
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      await ctx.reply(`❌ Kartu berhasil dirender tapi gagal dikirim (gaya ${style}):\n${err.message}\n💡 Coba: ${ctx.prefix}set owner cardstyle ${style === "preview" ? "image" : "preview"}`, { preview: false });
    }
  },
});
