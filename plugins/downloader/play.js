import { definePlugin } from "#lib/plugins";
import yts from "yt-search";
import { ApiError } from "#lib/api";
import { sendInteractive } from "#lib/interactive";
import { songs } from "#lib/songs";
import { fakeQuoted, formatNumber, getBuffer, truncate } from "#lib/utils";

/*
 * Alur 1 dari 3:  .play <judul>
 *   Pencarian memakai paket yt-search langsung (BUKAN api.zavedya.id, supaya tidak menambah endpoint di /status).
 *   → gambar (thumbnail hasil teratas) + tombol list pilih lagu.
 *   Tiap baris: judul · penulis / channel · durasi. Dipilih → .ytplay <link> (alur 2 & 3).
 */
const LIMIT = 10;
const ROW_TITLE_MAX = 60; // panjang judul baris list (turunkan ke 24 bila WhatsApp-mu menolak judul panjang)
const CAPTION_MAX = 980; // batas caption gambar WhatsApp ±1024

// Buang embel-embel "(Official Music Video)", "[Lyrics]" dll supaya judul lebih ringkas & lengkap.
const clean = (text) =>
  String(text)
    .replace(/\s*[([][^)\]]*(official|video|lyric|lirik|audio|mv|clip|hd|4k|live|karaoke)[^)\]]*[)\]]/gi, "")
    .replace(/\s*\b(official\s*(music\s*)?(video|audio)|lyrics?\s*video|video\s*lirik)\b\s*$/gi, "")
    .replace(/\s+/g, " ")
    .trim() || String(text);

export default definePlugin({
  name: "play",
  aliases: ["lagu"],
  category: "downloader",
  description: "Cari lagu di YouTube lalu pilih dari list",
  usage: "play <judul lagu>",
  async run({ ctx, sock, config }) {
    const query = ctx.argsStr || ctx.quotedText;
    if (!query) {
      return ctx.reply(`❌ Tulis judul lagu.\nContoh: *${ctx.prefix}play Virgoun Surat Cinta Untuk Starla*`, {
        preview: { title: "YouTube Play", body: "Cari lagu" },
      });
    }

    ctx.react("⏳");
    try {
      const found = await yts(query);
      const results = (found?.videos ?? [])
        .filter((v) => v?.url && v?.title && v.seconds > 0) // tanpa siaran langsung
        .slice(0, LIMIT)
        .map((v) => ({
          title: v.title,
          url: v.url,
          thumbnail: v.thumbnail ?? v.image,
          duration: v.timestamp ?? v.duration?.timestamp,
          author: { name: v.author?.name },
          views: v.views,
        }));
      if (!results.length) throw new ApiError(`Lagu "${query}" tidak ditemukan.`);

      for (const r of results) {
        songs.set(r.url, { title: r.title, author: r.author?.name, duration: r.duration, thumbnail: r.thumbnail });
      }

      // Gambar = thumbnail hasil teratas; gagal diunduh → gambar bawaan.
      const image = await getBuffer(results[0].thumbnail).catch(() => undefined);

      const rows = results.map((r, i) => ({
        title: truncate(`${i + 1}. ${clean(r.title)}`, ROW_TITLE_MAX),
        description: truncate([r.author?.name ?? "-", r.duration ?? "-", r.views > 0 && `${formatNumber(r.views)} views`].filter(Boolean).join(" • "), 72),
        id: `${ctx.prefix}ytplay ${r.url}`,
      }));

      // Caption = daftar lengkap (judul penuh · penulis · durasi), jaga-jaga bila baris list terpotong.
      const header = [`🎵 *YOUTUBE PLAY*`, `🔎 ${query}`, `📋 ${results.length} hasil — pilih lagunya di bawah 👇`, ""];
      const lines = [];
      let length = header.join("\n").length;
      for (const [i, r] of results.entries()) {
        const entry = `${i + 1}. ${truncate(clean(r.title), 70)}\n   👤 ${truncate(r.author?.name ?? "-", 30)} • ⏱️ ${r.duration ?? "-"}`;
        if (length + entry.length + 1 > CAPTION_MAX) break;
        lines.push(entry);
        length += entry.length + 1;
      }

      await sendInteractive(sock, ctx.chatId, {
        text: [...header, ...lines].join("\n"),
        image,
        buttons: [{ type: "list", text: "Pilih Lagu", sections: [{ title: "Hasil pencarian", rows }] }],
        mentions: [ctx.senderId],
        quoted: fakeQuoted.contact(config.name),
      });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error
    }
  },
});
