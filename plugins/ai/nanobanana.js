import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { collectMedia, mediaSource } from "#lib/extract";
import { uploadImage } from "#lib/upload";

// POST /ai/nanobanana  body JSON { prompt, imageUrl }  (ubah nama field di sini bila API memakai nama lain)
const LINK = /https?:\/\/\S+/i;

export default definePlugin({
  name: "nanobanana",
  aliases: ["nano", "img2img"],
  category: "ai",
  description: "Edit gambar dengan Nano Banana (image-to-image)",
  usage: "nanobanana <perintah edit> (kirim / reply gambar)",
  limit: 1,
  async run({ ctx }) {
    const link = ctx.argsStr.match(LINK)?.[0];
    const prompt = ctx.argsStr.replace(LINK, "").trim();
    if (!prompt) {
      return ctx.reply(`❌ Kirim / reply gambar dengan perintah edit.\nContoh: *${ctx.prefix}nanobanana ubah jadi gaya anime*`, {
        preview: { title: "Nano Banana", body: "Edit gambar dengan AI" },
      });
    }

    ctx.react("⏳");
    try {
      let imageUrl = link;
      if (!imageUrl) {
        const media = await ctx.fetchMedia().catch(() => null);
        if (media?.kind !== "image") throw new ApiError("Kirim atau reply sebuah gambar.");
        imageUrl = await uploadImage(media.buffer, { mimetype: media.mimetype });
      }

      const media = collectMedia(await api.post("/ai/nanobanana", { prompt, imageUrl }), { ignore: [imageUrl] });
      const image = media.image[0] ?? media.file[0];
      if (!image) throw new ApiError("API tidak mengembalikan gambar.");

      await ctx.reply({ image: mediaSource(image), caption: `🍌 *Nano Banana*\n${prompt}` });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err;
    }
  },
});
