import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { songs } from "#lib/songs";
import { bufferThumbnail, getBuffer, truncate } from "#lib/utils";
import { t as tl } from "#lib/i18n";

/*
 * Alur 2 & 3 dari 3:  .ytplay <link YouTube>   (dipanggil otomatis saat lagu dipilih dari list .play)
 *   2) lirik + info lagu, dikirim sebagai link preview dengan thumbnail lagu
 *   3) lagunya (MP3) menyusul
 * Unduhan: GET /downloader/youtube?url=…  → downloads[{ quality, format, audioOnly, url }]
 * Lirik:   GET /search/lyrics?artist=…&title=…  (artist & title wajib; ditebak dari judul video)
 */
const LINK = /https?:\/\/\S+/i;
const LARGE_PREVIEW = true; // true = gambar besar, false = gambar kecil di kiri
const MAX_MINUTES = 20; // lagu terlalu panjang (mix 1 jam, dll) ditolak
const MAX_LYRICS = 6000;

const seconds = (duration) => String(duration ?? "").split(":").reduce((n, part) => n * 60 + Number(part || 0), 0);

// "Artis - Judul (Official Video)" → { artist, title }; tanpa tanda "-" → pakai nama channel sebagai artis.
const clean = (text) =>
  String(text)
    .replace(/\s*[([][^)\]]*(official|video|lyric|lirik|audio|mv|clip|hd|4k|live|karaoke)[^)\]]*[)\]]/gi, "")
    .replace(/\s*\b(official\s*(music\s*)?(video|audio)|lyrics?\s*video|video\s*lirik|lirik)\b\s*$/gi, "")
    .replace(/\s+/g, " ")
    .trim();

const candidates = (title, author) => {
  const t = clean(title);
  const parts = t.split(/\s[-–—|]\s/);
  const channel = String(author ?? "").replace(/\s*-\s*topic$/i, "").replace(/\b(official|vevo|music|channel)\b/gi, "").replace(/\s+/g, " ").trim();
  const list = [];
  if (parts.length >= 2) {
    const [a, ...rest] = parts;
    list.push({ artist: a.trim(), title: rest.join(" - ").trim() }, { artist: rest.join(" - ").trim(), title: a.trim() });
  }
  if (channel) list.push({ artist: channel, title: t });
  return list.slice(0, 3);
};

const findLyrics = async (title, author) => {
  for (const guess of candidates(title, author)) {
    try {
      const data = await api.get("/search/lyrics", guess);
      if (typeof data.lyrics === "string" && data.lyrics.trim()) return { ...guess, ...data };
    } catch {
      // coba tebakan berikutnya
    }
  }
  return null;
};

export default definePlugin({
  name: "ytplay",
  category: "downloader",
  description: "Kirim lirik + lagu dari link YouTube (dipakai list .play)",
  usage: "ytplay <link YouTube>",
  hidden: true,
  limit: 1,
  async run({ ctx }) {
    const url = (ctx.argsStr || ctx.quotedText || "").match(LINK)?.[0];
    if (!url) {
      return ctx.reply(tl("dl.ytplay.1", { prefix: ctx.pfx }), {
        preview: { title: "YouTube Play", body: tl("dl.ytplay.2") },
      });
    }

    ctx.react("⏳");
    try {
      const meta = songs.get(url) ?? {};
      const dl = await api.get("/downloader/youtube", { url });
      const title = dl.title ?? meta.title ?? "Lagu";
      const duration = dl.duration ?? meta.duration;
      const thumbnail = dl.thumbnail ?? meta.thumbnail;

      if (seconds(duration) > MAX_MINUTES * 60) throw new ApiError(`Durasi terlalu panjang (maks ${MAX_MINUTES} menit).`);
      const audio = (dl.downloads ?? []).find((d) => d.audioOnly) ?? (dl.downloads ?? []).find((d) => d.format === "mp3");
      if (!audio?.url) throw new ApiError("Link audio tidak ditemukan.");

      // Alur 2 — lirik + info, link preview dengan thumbnail lagu
      const lyrics = await findLyrics(title, meta.author);
      const artist = lyrics?.artist ?? meta.author;
      const info = [
        `🎵 *${lyrics?.title ?? title}*`,
        artist && `👤 Artis : ${artist}`,
        lyrics?.album && `💿 Album : ${lyrics.album}`,
        `⏱️ Durasi : ${lyrics?.length ?? duration ?? "-"}`,
        lyrics?.language && `🌐 Bahasa : ${lyrics.language}`,
        lyrics?.writers && `✍️ Penulis : ${lyrics.writers}`,
        lyrics?.producer && `🎧 Produser : ${lyrics.producer}`,
      ].filter(Boolean);

      const text = lyrics ? [...info, "", "♪", truncate(lyrics.lyrics.trim(), MAX_LYRICS)].join("\n") : [...info, "", "ℹ️ Lirik tidak ditemukan."].join("\n");
      const thumb = thumbnail ? await getBuffer(thumbnail).then((b) => bufferThumbnail(b, 640)).catch(() => undefined) : undefined;

      await ctx.reply(text, {
        preview: { large: LARGE_PREVIEW, title: lyrics?.title ?? title, body: [artist, duration].filter(Boolean).join(" • ") || "YouTube", url, ...(thumb && { thumbnail: thumb }) },
      });

      // Alur 3 — lagunya
      await ctx.reply({ audio: { url: audio.url }, mimetype: "audio/mpeg" });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
