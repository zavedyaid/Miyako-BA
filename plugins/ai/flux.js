import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { collectMedia, mediaSource } from "#lib/extract";
import { t as tl } from "#lib/i18n";

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
      return ctx.reply(tl("ai.flux.1", { prefix: ctx.pfx }), {
        preview: { title: "FLUX", body: tl("ai.flux.2") },
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
