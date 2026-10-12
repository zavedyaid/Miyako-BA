import { definePlugin } from "#lib/plugins";
import { makeSticker, withExif } from "#lib/sticker";

const MAX_VIDEO = 15 * 1024 * 1024;

export default definePlugin({
  name: "s",
  aliases: ["stiker", "sticker"],
  category: "maker",
  description: "Ubah gambar/video/GIF jadi stiker",
  limit: 1,
  usage: "s [fit] [packname|author] (kirim atau reply gambar/video)",
  async run({ ctx, config }) {
    const pfx = ctx.prefix;
    const media = await ctx.fetchMedia();

    if (!media || !["image", "video", "sticker"].includes(media.kind)) {
      return ctx.reply(
        [
          "🖼️ *STIKER*",
          "Kirim atau reply gambar / video / GIF dengan caption:",
          `› *${pfx}s*`,
          `› *${pfx}s packname|author*`,
          `› *${pfx}s fit* (tanpa crop, sisi kosong transparan)`,
          "",
          "Hasil 1:1 (crop tengah). Video maksimal ±8 detik.",
        ].join("\n"),
        { preview: { title: "Stiker Maker", body: "Kirim / reply gambar atau video" } },
      );
    }

    if (media.kind === "video" && media.buffer.length > MAX_VIDEO) {
      return ctx.reply("❌ Video terlalu besar (maks 15 MB).");
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
