import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { profileLines } from "#lib/extract";

// GET /tools/tempmail → alamat email sementara
export default definePlugin({
  name: "tempmail",
  aliases: ["tmpmail", "emailsementara"],
  category: "tools",
  description: "Buat email sementara",
  limit: 1,
  async run({ ctx }) {
    ctx.react("⏳");
    try {
      const { lines } = profileLines(await api.get("/tools/tempmail"));
      if (!lines.length) throw new ApiError("API tidak mengembalikan email.");

      await ctx.reply(["📧 *TEMP MAIL*", "", ...lines].join("\n"), { preview: { title: "Temp Mail", body: "Email sementara" } });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err;
    }
  },
});
