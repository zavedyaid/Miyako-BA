import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { collectMedia, fileNameOf, mediaSource, mimeOf } from "#lib/extract";
import { t as tl } from "#lib/i18n";

// GET /downloader/terabox?url=…   (ubah nama parameter di sini bila API memakai nama lain)
const PATH = "/downloader/terabox";
const LINK = /https?:\/\/\S+/i;

export default definePlugin({
  name: "terabox",
  aliases: ["tb"],
  category: "downloader",
  description: "Unduh file TeraBox",
  usage: "terabox <link>",
  limit: 1,
  async run({ ctx }) {
    const url = ctx.argsStr.match(LINK)?.[0] ?? ctx.quotedText?.match(LINK)?.[0];
    if (!url) {
      return ctx.reply(tl("dl.terabox.1", { prefix: ctx.pfx }), {
        preview: { title: "TeraBox", body: "Downloader" },
      });
    }

    ctx.react("⏳");
    try {
      const media = collectMedia(await api.get(PATH, { url }), { ignore: [url] });
      const caption = `📦 *TeraBox*${media.title ? `\n${media.title}` : ""}`;

      const files = [...media.file, ...media.video, ...media.audio, ...media.image].slice(0, 3);
      if (!files.length) throw new ApiError("File tidak ditemukan di respons API.");

      for (const [i, file] of files.entries()) {
        const fileName = (i === 0 && media.filename) || fileNameOf(file, `file-${i + 1}`);
        await ctx.reply({ document: mediaSource(file), mimetype: mimeOf(fileName), fileName, ...(i === 0 && { caption }) });
      }
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
