import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { collectMedia, mediaSource } from "#lib/extract";

// GET /ai/flux-image?prompt=…  → gambar (link atau data:image/…;base64)
export default definePlugin({
  name: "flux",
  aliases: ["fluximage", "imagine"],
  category: "ai",
  description: "Buat gambar dengan FLUX",
  usage: "flux <deskripsi gambar>",
  limit: 1,
  async run({ ctx }) {
    const prompt = ctx.argsStr || ctx.quotedText;
    if (!prompt) {
      return ctx.reply(`❌ Tulis deskripsi gambar.\nContoh: *${ctx.prefix}flux kucing astronaut di bulan*`, {
        preview: { title: "FLUX", body: "Buat gambar dari teks" },
      });
    }

    ctx.react("⏳");
    try {
      const media = collectMedia(await api.get("/ai/flux-image", { prompt }));
      const image = media.image[0] ?? media.file[0];
      if (!image) throw new ApiError("API tidak mengembalikan gambar.");

      await ctx.reply({ image: mediaSource(image), caption: `🎨 *FLUX*\n${prompt}` });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err;
    }
  },
});
