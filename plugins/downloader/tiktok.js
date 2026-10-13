import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { collectMedia, mediaSource } from "#lib/extract";

/*
 * GET /downloader/tiktok?url=…
 * Respons:
 * {
 *   author, status, id, title, isVideo, region, duration,
 *   uploader: { username, nickname, avatar },
 *   stats: { likes, views, shares, comments },
 *   cover, music: { title, author },
 *   downloads: [{ type: "nowm" | "music" | …, label, url }]
 * }
 */
const PATH = "/downloader/tiktok";
const LINK = /https?:\/\/\S+/i;
const MAX_IMAGES = 10; // slideshow / postingan foto

const nf = new Intl.NumberFormat("id-ID");
const num = (v) => (Number.isFinite(Number(v)) ? nf.format(Number(v)) : null);

// Urutan prioritas: kualitas tertinggi tanpa watermark lebih dulu
const VIDEO_TYPES = ["hd", "nowm_hd", "nowm", "video"];
const AUDIO_TYPES = ["music", "audio", "mp3"];
const IMAGE_TYPES = /^(image|images|photo|photos|slide|slides|img)/i;

const byType = (downloads, types) => {
  for (const type of types) {
    const found = downloads.find((d) => String(d?.type).toLowerCase() === type && d?.url);
    if (found) return found.url;
  }
  return undefined;
};

const buildCaption = (d) => {
  const up = d.uploader ?? {};
  const st = d.stats ?? {};
  const music = d.music ?? {};

  const who = [up.nickname, up.username && `@${up.username}`].filter(Boolean).join(" ");
  const info = [d.region && `🌍 ${d.region}`, d.duration && `⏱️ ${d.duration}`].filter(Boolean).join("  •  ");
  const stats = [
    num(st.likes) && `❤️ ${num(st.likes)}`,
    num(st.views) && `👁️ ${num(st.views)}`,
    num(st.shares) && `🔁 ${num(st.shares)}`,
    num(st.comments) && `💬 ${num(st.comments)}`,
  ]
    .filter(Boolean)
    .join("  •  ");
  const song = [music.title, music.author].filter(Boolean).join(" — ");

  return [
    "🎬 *TikTok Downloader*",
    d.title && `\n📝 ${d.title}`,
    who && `\n👤 ${who}`,
    info,
    stats,
    song && `🎵 ${song}`,
    d.id && `🆔 ${d.id}`,
  ]
    .filter(Boolean)
    .join("\n");
};

export default definePlugin({
  name: "tiktok",
  aliases: ["tt", "ttdl"],
  category: "downloader",
  description: "Unduh video / foto TikTok + musiknya (tanpa watermark, kualitas asli)",
  usage: "tiktok <link>",
  limit: 1,
  async run({ ctx }) {
    const url = ctx.argsStr.match(LINK)?.[0] ?? ctx.quotedText?.match(LINK)?.[0];
    if (!url) {
      return ctx.reply(`❌ Kirim link TikTok.\nContoh: *${ctx.prefix}tiktok https://vt.tiktok.com/xxxx*`, {
        preview: { title: "TikTok", body: "Downloader" },
      });
    }

    ctx.react("⏳");
    try {
      const data = await api.get(PATH, { url });
      const downloads = Array.isArray(data.downloads) ? data.downloads : [];
      const caption = buildCaption(data);

      const video = byType(downloads, VIDEO_TYPES);
      const music = byType(downloads, AUDIO_TYPES);
      let images = downloads.filter((d) => d?.url && IMAGE_TYPES.test(String(d.type))).map((d) => d.url);

      // Cadangan bila bentuk respons berubah: cari media apa pun di dalam JSON
      const fallback = !video && !images.length && !music ? collectMedia(data, { ignore: [url] }) : null;
      const videoUrl = video ?? fallback?.video[0];
      if (!videoUrl && !images.length) images = fallback?.image ?? [];

      if (videoUrl) {
        await ctx.reply({ video: mediaSource(videoUrl), caption, mimetype: "video/mp4" });
      } else if (images.length) {
        // Postingan foto / slideshow
        for (const [i, image] of images.slice(0, MAX_IMAGES).entries()) {
          await ctx.reply({ image: mediaSource(image), ...(i === 0 && { caption }) });
        }
      } else if (!music && !fallback?.audio[0]) {
        throw new ApiError("Media tidak ditemukan di respons API.");
      } else {
        await ctx.reply(caption);
      }

      // Musiknya ikut dikirim; kalau gagal, video yang sudah terkirim tidak dianggap gagal
      const audioUrl = music ?? fallback?.audio[0];
      if (audioUrl) {
        const title = data.music?.title || "tiktok-audio";
        await ctx
          .reply({ audio: mediaSource(audioUrl), mimetype: "audio/mpeg", fileName: `${title}.mp3` })
          .catch(() => ctx.reply(`⚠️ Video terkirim, tapi audionya gagal dikirim.`, { preview: false }));
      }

      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
