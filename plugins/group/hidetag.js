import { definePlugin } from "#lib/plugins";
import { mentionJid } from "#lib/targets";
import { t as tl } from "#lib/i18n";

/*
 * Kirim pesan yang me-mention semua anggota tanpa menampilkan daftarnya.
 *   .hidetag <teks>              → teks
 *   reply pesan + .hidetag       → teks pesan itu
 *   reply / kirim gambar atau video + .hidetag [teks] → media dikirim ulang dengan mention
 */
export default definePlugin({
  name: "hidetag",
  aliases: ["ht", "h"],
  category: "group",
  description: "Mention semua anggota tanpa daftar (teks / gambar / video)",
  usage: "hidetag <teks> (atau reply pesan)",
  access: { group: true, admin: true },
  async run({ ctx, group }) {
    const { meta } = await group();
    const mentions = (meta?.participants ?? []).map(mentionJid);
    if (!mentions.length) return ctx.reply(tl("grp.hidetag.1"));

    const media = ctx.hasMedia ? await ctx.fetchMedia().catch(() => null) : null;
    const text = ctx.argsStr || ctx.quotedText || "";

    if (media && ["image", "video"].includes(media.kind)) {
      return ctx.reply({ [media.kind]: media.buffer, caption: text || undefined, mentions }, { quoted: false });
    }
    if (!text) return ctx.reply(tl("grp.hidetag.2", { prefix: ctx.pfx, prefix1: ctx.pfx }));

    await ctx.reply({ text, mentions }, { quoted: false, preview: false });
  },
});
