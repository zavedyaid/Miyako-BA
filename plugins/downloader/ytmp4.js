import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { t as tl } from "#lib/i18n";

// GET /downloader/youtube?url=…  → downloads: [{ quality: "720p", format: "mp4", audioOnly, url }]
const LINK = /https?:\/\/\S+/i;
const DEFAULT_QUALITY = 480; // kualitas bawaan: tertinggi yang ≤ angka ini (video besar lama dikirim)
const MAX_MINUTES = 15;
const seconds = (d) => String(d ?? "").split(":").reduce((n, part) => n * 60 + Number(part || 0), 0);

export default definePlugin({
  name: "ytmp4",
  aliases: ["ytv", "youtube", "ytvideo"],
  category: "downloader",
  description: "Unduh video YouTube (MP4)",
  usage: "ytmp4 <link YouTube> [kualitas, mis. 720]",
  limit: 1,
  async run({ ctx }) {
    const input = ctx.argsStr || ctx.quotedText || "";
    const url = input.match(LINK)?.[0];
    if (!url) {
      return ctx.reply(tl("dl.ytmp4.1", { prefix: ctx.pfx }), {
        preview: { title: "YouTube MP4", body: tl("dl2.ytmp4.1") },
      });
    }
    const wanted = Number.parseInt(input.replace(LINK, "").match(/\d{3,4}/)?.[0], 10);

    ctx.react("⏳");
    try {
      const dl = await api.get("/downloader/youtube", { url });
      if (seconds(dl.duration) > MAX_MINUTES * 60) throw new ApiError(`Durasi terlalu panjang (maks ${MAX_MINUTES} menit).`);

      const videos = (dl.downloads ?? [])
        .filter((d) => !d.audioOnly && d.url)
        .map((d) => ({ ...d, p: Number.parseInt(d.quality, 10) || 0 }))
        .sort((a, b) => a.p - b.p);
      if (!videos.length) throw new ApiError("Link video tidak ditemukan.");

      // Kualitas diminta → yang paling dekat (tidak melebihi bila ada); selain itu tertinggi ≤ bawaan.
      const target = wanted || DEFAULT_QUALITY;
      const pick = [...videos].reverse().find((v) => v.p <= target) ?? videos[0];

      await ctx.reply({
        video: { url: pick.url },
        caption: [`🎬 *${dl.title ?? "YouTube"}*`, `📺 ${pick.quality ?? "-"} • ⏱️ ${dl.duration ?? "-"}`].join("\n"),
      });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
