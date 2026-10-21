import { definePlugin } from "#lib/plugins";
import { makeSticker, withExif } from "#lib/sticker";
import { t as tl } from "#lib/i18n";

const MAX_VIDEO = 15 * 1024 * 1024;

export default definePlugin({
  name: "s",
  aliases: ["stiker", "sticker"],
  category: "maker",
  description: "Ubah gambar/video/GIF jadi stiker",
  limit: 1,
  usage: "s [fit] [packname|author] (kirim atau reply gambar/video)",
  async run({ ctx, config }) {
    const pfx = ctx.pfx;
    const media = await ctx.fetchMedia();

    if (!media || !["image", "video", "sticker"].includes(media.kind)) {
      return ctx.reply(
        [
          "🖼️ *STIKER*",
          tl("mk.sticker.1"),
          `› *${pfx}s*`,
          `› *${pfx}s packname|author*`,
          tl("mk2.sticker.1", { pfx }),
          "",
          tl("mk.sticker.2"),
        ].join("\n"),
        { preview: { title: "Stiker Maker", body: tl("mk.sticker.3") } },
      );
    }

    if (media.kind === "video" && media.buffer.length > MAX_VIDEO) {
      return ctx.reply(tl("mk.sticker.4"));
    }

    const fit = /^(fit|full)(\s|$)/i.test(ctx.argsStr);
    const [packname, author] = ctx.argsStr.replace(/^(fit|full)\s*/i, "").split("|").map((v) => v.trim());
    const meta = {
      packname: packname || config.sticker?.packname,
      author: (packname ? author : null) || config.sticker?.author,
    };

    ctx.react("⏳");
    const animated = media.kind === "video" || media.mimetype === "image/gif";
    const sticker =
      media.kind === "sticker" ? await withExif(media.buffer, meta) : await makeSticker(media.buffer, { animated, fit, ...meta });

    await ctx.reply(sticker, { type: "sticker" });
    ctx.react("✅");
  },
});
