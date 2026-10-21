import { definePlugin } from "#lib/plugins";
import { MAX_UPLOAD, uploadFile } from "#lib/upload";
import { getBuffer } from "#lib/utils";
import { t as tl } from "#lib/i18n";

/*
 * Unggah media ke Zavedya CDN → link publik.
 *   POST https://cdn.zavedya.id/upload   (multipart, field "file")
 * Sumber: gambar / video / audio / dokumen / stiker yang dikirim atau di-reply,
 * atau link http(s) langsung ke sebuah file.
 */
const LINK = /https?:\/\/\S+/i;

const size = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
};

export default definePlugin({
  name: "tourl",
  aliases: ["upload", "tolink", "cdn"],
  category: "tools",
  description: "Unggah media / file ke CDN dan dapatkan link",
  usage: "tourl (kirim / reply media, atau <link file>)",
  limit: 1,
  async run({ ctx }) {
    const link = ctx.argsStr.match(LINK)?.[0];
    const media = link ? null : await ctx.fetchMedia().catch(() => null);

    if (!link && !media) {
      return ctx.reply(tl("tool.tourl.1", { prefix: ctx.pfx, prefix1: ctx.pfx }), {
        preview: { title: "To URL", body: "Unggah file ke CDN" },
      });
    }

    ctx.react("⏳");
    try {
      let buffer;
      let mimetype;
      if (link) {
        buffer = await getBuffer(link, { timeout: 60_000 });
      } else {
        buffer = media.buffer;
        mimetype = media.mimetype;
      }
      if (buffer.length > MAX_UPLOAD) throw new Error(`File terlalu besar (${size(buffer.length)}, maks ${size(MAX_UPLOAD)}).`);

      const url = await uploadFile(buffer, { mimetype });
      const text = ["✅ *Upload berhasil*", `🔗 ${url}`, `📦 ${size(buffer.length)}`, mimetype && `🗂️ ${mimetype.split(";")[0]}`]
        .filter(Boolean)
        .join("\n");

      // Tombol salin link; kalau pesan interaktif gagal, kirim teks biasa.
      try {
        await ctx.card(text, { buttons: [{ type: "copy", text: "📋 Salin Link", code: url }] });
      } catch {
        await ctx.reply(text, { preview: false });
      }
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
