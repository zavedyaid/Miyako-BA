import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { collectMedia, fileNameOf, mediaSource, mimeOf } from "#lib/extract";
import { uploadImage } from "#lib/upload";
import { t as tl } from "#lib/i18n";

// GET /tools/converter?url=…&format=…   (ubah nama parameter di sini bila API memakai nama lain)
const LINK = /https?:\/\/\S+/i;

export default definePlugin({
  name: "converter",
  aliases: ["convert", "konversi"],
  category: "tools",
  description: "Ubah format file / gambar",
  usage: "converter <format> <link> (atau kirim / reply gambar)",
  limit: 1,
  async run({ ctx }) {
    const link = ctx.argsStr.match(LINK)?.[0] ?? ctx.quotedText?.match(LINK)?.[0];
    const format = ctx.argsStr.replace(LINK, "").trim().split(/\s+/)[0]?.toLowerCase();
    if (!format) {
      return ctx.reply(tl("tool.converter.1", { prefix: ctx.pfx, prefix1: ctx.pfx }), {
        preview: { title: "Converter", body: tl("tool.converter.2") },
      });
    }

    ctx.react("⏳");
    try {
      let url = link;
      if (!url) {
        const media = await ctx.fetchMedia().catch(() => null);
        if (media?.kind !== "image") throw new ApiError("Kirim link atau gambar yang mau diubah.");
        url = await uploadImage(media.buffer, { mimetype: media.mimetype });
      }

      const media = collectMedia(await api.get("/tools/converter", { url, format }), { ignore: [url] });
      const file = media.file[0] ?? media.image[0] ?? media.video[0] ?? media.audio[0];
      if (!file) throw new ApiError("API tidak mengembalikan file hasil.");

      const fileName = media.filename ?? fileNameOf(file, `hasil.${format}`);
      await ctx.reply({ document: mediaSource(file), mimetype: mimeOf(fileName), fileName, caption: `🔄 Diubah ke *${format}*` });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err;
    }
  },
});
