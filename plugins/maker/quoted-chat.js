import { definePlugin } from "#lib/plugins";
import { ApiError } from "#lib/api";
import { makeSticker } from "#lib/sticker";
import { getBuffer } from "#lib/utils";

export default definePlugin({
  name: "qc",
  aliases: ["quote", "quotechat"],
  category: "maker",
  description: "Buat quote chat jadi stiker",
  usage: "qc <teks> [| nama] [| link avatar]",
  limit: 1,
  async run({ ctx, sock }) {
    const [text, nama, avatar] = ctx.argsStr.split("|").map((s) => s.trim());
    if (!text) {
      return ctx.reply(
        [
          "🖼️ *QUOTE CHAT*",
          "",
          `› *${ctx.prefix}qc <teks>*`,
          `› *${ctx.prefix}qc <teks> | nama*`,
          `› *${ctx.prefix}qc <teks> | nama | link avatar*`,
          "",
          "Nama default = namamu.",
          "Avatar default = foto profilmu.",
        ].join("\n"),
        { preview: { title: "Quote Chat", body: "Buat quote chat jadi stiker" } },
      );
    }

    ctx.react("⏳");
    try {
      let url = avatar || (await ctx.fetchMedia().catch(() => null))?.buffer;
      if (Buffer.isBuffer(url)) {
        const form = new FormData();
        form.append("file", new Blob([url], { type: "image/jpeg" }), "a.jpg");
        form.append("expire", "5m");
        url = (await fetch("https://cdn.rullzfuqi.web.id/api/upload", { method: "POST", body: form }).then((r) => r.json()).catch(() => null))?.result?.files?.[0]?.url;
      } else if (!url) {
        const pp = await sock.profilePictureUrl(ctx.senderId, "image").catch(() => null);
        if (pp) {
          const form = new FormData();
          form.append("file", new Blob([await getBuffer(pp)], { type: "image/jpeg" }), "a.jpg");
          form.append("expire", "5m");
          url = (await fetch("https://cdn.rullzfuqi.web.id/api/upload", { method: "POST", body: form }).then((r) => r.json()).catch(() => null))?.result?.files?.[0]?.url;
        }
      }

      const res = await fetch(`https://api.rullzfuqi.web.id/v2/maker/quote?${new URLSearchParams({ name: nama || ctx.pushName, text, ...(url && { url }) })}`);
      if (!res.ok) throw new ApiError(`API error (HTTP ${res.status})`);

      const buffer = Buffer.from(await res.arrayBuffer());
      if (!buffer.length) throw new ApiError("API tidak mengembalikan gambar.");

      await ctx.reply(await makeSticker(buffer), { type: "sticker" });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err;
    }
  },
});
