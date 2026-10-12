import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { collectMedia, profileLines } from "#lib/extract";
import { truncate } from "#lib/utils";

// GET /wiki/honor-of-kings?name=…   (ubah nama parameter di sini bila API memakai nama lain)
const PATH = "/wiki/honor-of-kings";

export default definePlugin({
  name: "hok",
  aliases: ["honorofkings"],
  category: "wiki",
  description: "Wiki karakter Honor of Kings",
  usage: "hok <nama karakter>",
  limit: 1,
  async run({ ctx }) {
    const name = ctx.argsStr || ctx.quotedText;
    if (!name) {
      return ctx.reply(`❌ Tulis nama karakter.\nContoh: *${ctx.prefix}hok Luban*`, {
        preview: { title: "Honor of Kings", body: "Wiki karakter" },
      });
    }

    ctx.react("⏳");
    try {
      const data = await api.get(PATH, { name });
      const { lines } = profileLines(data, 20);
      if (!lines.length) throw new ApiError(`Karakter "${name}" tidak ditemukan.`);

      const media = collectMedia(data);
      const picture = media.image[0] ?? media.thumb[0];
      const text = truncate([`👑 *Honor of Kings* · ${name}`, "", ...lines].join("\n"), 3800);

      if (picture) {
        try {
          await ctx.reply({ image: { url: picture }, caption: text });
          ctx.react("✅");
          return;
        } catch {
          // gambar gagal diunduh → jatuh ke teks
        }
      }
      await ctx.reply(text, { preview: { title: "Honor of Kings", body: name } });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
