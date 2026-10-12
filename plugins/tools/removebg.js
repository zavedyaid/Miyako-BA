import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { uploadImage } from "#lib/upload";

/*
 * Hapus background gambar. API: GET /v1/tools/removebg?imageUrl=<link gambar>
 * Respons: { resultUrl: "data:image/png;base64,…" }  (atau link http biasa)
 * Sumber gambar: link di perintah / teks yang di-reply, atau gambar yang dikirim/di-reply
 * (gambar WhatsApp diunggah dulu ke cdn.zavedya.id untuk mendapat link).
 * Hasil dikirim sebagai dokumen PNG supaya latar transparan tidak berubah jadi hitam/putih.
 */
const LINK = /https?:\/\/\S+/i;

export default definePlugin({
  name: "removebg",
  aliases: ["rbg", "nobg"],
  category: "tools",
  description: "Hapus background gambar",
  usage: "removebg (kirim / reply gambar, atau <link gambar>)",
  limit: 1,
  async run({ ctx }) {
    let imageUrl = ctx.argsStr.match(LINK)?.[0] ?? ctx.quotedText?.match(LINK)?.[0];

    if (!imageUrl) {
      const media = await ctx.fetchMedia().catch(() => null);
      if (media?.kind === "image") {
        ctx.react("⏳");
        imageUrl = await uploadImage(media.buffer, { mimetype: media.mimetype });
      }
    }

    if (!imageUrl) {
      return ctx.reply(`❌ Kirim link gambar.\nContoh: *${ctx.prefix}removebg https://example.com/foto.jpg*`, {
        preview: { title: "Remove BG", body: "Hapus background gambar" },
      });
    }

    ctx.react("⏳");
    try {
      const data = await api.get("/tools/removebg", { imageUrl });
      const result = String(data.resultUrl ?? "");
      if (!result) throw new ApiError("API tidak mengembalikan hasil.");

      // data:image/png;base64,… → buffer; link biasa dikirim lewat URL.
      const inline = result.match(/^data:(image\/[\w.+-]+);base64,(.+)$/s);
      const file = inline ? Buffer.from(inline[2], "base64") : { url: result };

      await ctx.reply({ document: file, mimetype: inline?.[1] ?? "image/png", fileName: "removebg.png", caption: "✅ Background dihapus" });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
