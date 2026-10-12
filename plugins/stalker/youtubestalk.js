import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { profileLines } from "#lib/extract";

// GET /stalker/youtube?username=…   (ubah nama parameter di sini bila API memakai nama lain)
const PATH = "/stalker/youtube";

export default definePlugin({
  name: "youtubestalk",
  aliases: ["ytstalk"],
  category: "stalker",
  description: "Lihat profil YouTube",
  usage: "youtubestalk <username>",
  limit: 1,
  async run({ ctx }) {
    const username = (ctx.argsStr || ctx.quotedText || "").trim().replace(/^@/, "");
    if (!username) {
      return ctx.reply(`❌ Masukkan username.\nContoh: *${ctx.prefix}youtubestalk mrbeast*`, {
        preview: { title: "YouTube", body: "Stalker" },
      });
    }

    ctx.react("⏳");
    try {
      const { lines, avatar } = profileLines(await api.get(PATH, { username }));
      if (!lines.length) throw new ApiError(`Profil "${username}" tidak ditemukan.`);

      const text = [`▶️ *YouTube* · @${username}`, "", ...lines].join("\n");
      // Ada foto profil → kirim sebagai gambar + teks; tidak ada → teks biasa.
      if (avatar) {
        try {
          await ctx.reply({ image: { url: avatar }, caption: text });
          ctx.react("✅");
          return;
        } catch {
          // gambar gagal diunduh → jatuh ke teks
        }
      }
      await ctx.reply(text, { preview: { title: "YouTube", body: `@${username}` } });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
