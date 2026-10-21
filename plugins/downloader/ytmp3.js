import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { bufferThumbnail, getBuffer } from "#lib/utils";
import { t as tl } from "#lib/i18n";

// GET /downloader/youtube?url=…  → { title, duration, thumbnail, downloads: [{ quality, format, audioOnly, url }] }
const LINK = /https?:\/\/\S+/i;
const MAX_MINUTES = 20;
const seconds = (d) => String(d ?? "").split(":").reduce((n, part) => n * 60 + Number(part || 0), 0);

export default definePlugin({
  name: "ytmp3",
  aliases: ["yta", "ytaudio"],
  category: "downloader",
  description: "Unduh audio (MP3) dari video YouTube",
  usage: "ytmp3 <link YouTube>",
  limit: 1,
  async run({ ctx }) {
    const url = (ctx.argsStr || ctx.quotedText || "").match(LINK)?.[0];
    if (!url) {
      return ctx.reply(tl("dl.ytmp3.1", { prefix: ctx.pfx }), {
        preview: { title: "YouTube MP3", body: tl("dl2.ytmp3.1") },
      });
    }

    ctx.react("⏳");
    try {
      const dl = await api.get("/downloader/youtube", { url });
      if (seconds(dl.duration) > MAX_MINUTES * 60) throw new ApiError(`Durasi terlalu panjang (maks ${MAX_MINUTES} menit).`);
      const audio = (dl.downloads ?? []).find((d) => d.audioOnly) ?? (dl.downloads ?? []).find((d) => d.format === "mp3");
      if (!audio?.url) throw new ApiError("Link audio tidak ditemukan.");

      const thumb = dl.thumbnail ? await getBuffer(dl.thumbnail).then((b) => bufferThumbnail(b, 640)).catch(() => undefined) : undefined;
      await ctx.reply([`🎧 *${dl.title ?? "YouTube"}*`, `⏱️ ${dl.duration ?? "-"}`].join("\n"), {
        preview: { large: true, title: dl.title ?? "YouTube", body: `MP3 • ${dl.duration ?? "-"}`, url, ...(thumb && { thumbnail: thumb }) },
      });
      await ctx.reply({ audio: { url: audio.url }, mimetype: "audio/mpeg" });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
