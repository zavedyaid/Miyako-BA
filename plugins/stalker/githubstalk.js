import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { profileLines } from "#lib/extract";

// GET /stalker/github?username=…   (ubah nama parameter di sini bila API memakai nama lain)
const PATH = "/stalker/github";

export default definePlugin({
  name: "githubstalk",
  aliases: ["ghstalk", "github"],
  category: "stalker",
  description: "Lihat profil GitHub",
  usage: "githubstalk <username>",
  limit: 1,
  async run({ ctx }) {
    const username = (ctx.argsStr || ctx.quotedText || "").trim().replace(/^@/, "");
    if (!username) {
      return ctx.reply(`❌ Masukkan username.\nContoh: *${ctx.prefix}githubstalk torvalds*`, {
        preview: { title: "GitHub", body: "Stalker" },
      });
    }

    ctx.react("⏳");
    try {
      const { lines, avatar } = profileLines(await api.get(PATH, { username }));
      if (!lines.length) throw new ApiError(`Profil "${username}" tidak ditemukan.`);

      const text = [`🐙 *GitHub* · @${username}`, "", ...lines].join("\n");
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
      await ctx.reply(text, { preview: { title: "GitHub", body: `@${username}` } });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
