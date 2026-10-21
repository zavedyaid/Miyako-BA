import { definePlugin } from "#lib/plugins";
import { t } from "#lib/i18n";
import { MEME_MAX, makeMemeSticker } from "#lib/sticker";

const MAX_VIDEO = 15 * 1024 * 1024;

/*
 * .smeme atas|bawah   → stiker dengan teks atas & bawah (gambar / video / stiker yang dikirim atau di-reply)
 * .smeme |bawah       → hanya teks bawah       .smeme atas → hanya teks atas
 */
export default definePlugin({
  name: "smeme",
  aliases: ["stickermeme", "stikermeme", "memestiker"],
  category: "maker",
  description: "Make a sticker with top / bottom text (top|bottom)",
  limit: 1,
  usage: "smeme top|bottom (send or reply to an image / video / sticker)",
  async run({ ctx, config }) {
    const p = ctx.pfx;
    const media = await ctx.fetchMedia();
    if (!media || !["image", "video", "sticker"].includes(media.kind)) {
      return ctx.reply(t("smeme.usage", { p }), { preview: { title: t("smeme.usageTitle"), body: t("smeme.usageBody") } });
    }
    if (media.kind === "video" && media.buffer.length > MAX_VIDEO) return ctx.reply(t("smeme.tooBig"));

    // "atas|bawah" — kalau tidak ada "|", semuanya dianggap teks atas.
    const raw = ctx.argsStr;
    const cut = raw.indexOf("|");
    const [top, bottom] = cut === -1 ? [raw.trim(), ""] : [raw.slice(0, cut).trim(), raw.slice(cut + 1).trim()];
    if (!top && !bottom) return ctx.reply(t("smeme.noText", { p }));
    if (top.length > MEME_MAX || bottom.length > MEME_MAX) return ctx.reply(t("smeme.tooLong", { n: MEME_MAX }));

    ctx.react("⏳");
    try {
      const animated = media.kind === "video" || media.mimetype === "image/gif";
      const sticker = await makeMemeSticker(media.buffer, { top, bottom, animated, packname: config.sticker?.packname, author: config.sticker?.author });
      await ctx.reply(sticker, { type: "sticker" });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      await ctx.reply(t("smeme.failed", { err: err.message.split("\n")[0] }));
    }
  },
});
