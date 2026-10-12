# ❄ Yuki Archive

WhatsApp bot di atas **@zavedyaid/baileys** (fork Baileys dengan pesan interaktif bawaan). Import Baileys lewat `#lib/baileys`.

## Jalankan

```bash
npm install
npm start
```

Isi `ownerNumbers` di `config/config.json` lebih dulu. Butuh Node ≥ 20.11 dan `ffmpeg` (untuk stiker). Run pertama menanyakan login via pairing code atau QR.

## Struktur

```
Yuki-Archive/
├── main.js          boot, koneksi, reconnect, scheduler
├── handler.js       alur pesan masuk + semua middleware
├── events.js        sambutan grup, buka/tutup, anti-delete, anti-call
├── config/          config.json, thumbnail.jpg, reply/ (gambar acak kartu balasan)
├── lib/
│   ├── config.js    loader config
│   ├── channel.js   label "diteruskan dari channel" di semua pesan keluar
│   ├── upload.js    unggah gambar ke cdn.zavedya.id → link (removebg, nanobanana, converter)
│   ├── extract.js   pembantu membaca respons API di plugin (teks, daftar, media, profil)
│   ├── api.js       router api.zavedya.id — hanya sambungan (api.get / api.post)
│   ├── levelup.js   notifikasi naik level
│   ├── baileys.js   satu pintu import library Baileys
│   ├── interactive.js pesan gambar + promo + tombol/list (nativeFlow bawaan fork)
│   ├── database.js  database JSON
│   ├── logger.js    log & banner
│   ├── plugins.js   definePlugin + loader (hot-reload)
│   ├── serialize.js pesan mentah → ctx
│   ├── groups.js    cache grup + cek admin
│   ├── sticker.js   media → stiker
│   └── utils.js     jid, waktu, teks, media, cache, http
└── plugins/
    ├── general/     menu, ping, profil, afk
    ├── ai/          gemini, claude, gpt, deepseek, glm, kimi, qwen, … + aimodels, flux, nanobanana (16)
    ├── downloader/  tiktok, dailymotion, likee, rednote, pindl, soundcloud, mediafire, terabox, ytplay (9)
    ├── search/      pinterest, konachan, dafont, dramabox, gnews, scsearch, yts (7)
    ├── stalker/     githubstalk, tiktokstalk, youtubestalk (3)
    ├── tools/       removebg, converter, tempmail (3)
    ├── maker/       sticker (.s / .stiker — 1:1, `.s fit` tanpa crop)
    └── owner/       eval, exec, restart, setmode
```

Import antar-lib memakai alias, contoh `import { db } from "#lib/database"`.

> **Update file di `lib/`, `handler.js`, `main.js`, `config/`?** Wajib *Restart* bot. Hot-reload hanya untuk `plugins/`; plugin yang di-reload tetap memakai `lib/` versi lama dari memori, makanya muncul error "does not provide an export" kalau file dicampur.

## Membuat command

Buat file `.js` di `plugins/<kategori>/`. Langsung aktif tanpa restart. File berawalan `_` diabaikan.

```js
import { definePlugin } from "#lib/plugins";

export default definePlugin({
  name: "halo",
  aliases: ["hai"],
  category: "general",
  description: "Menyapa",
  limit: 0,
  access: { group: true },
  async run({ ctx, sock, db, config, registry, user, role }) {
    await ctx.reply(`Halo ${ctx.pushName}!`);
  },
});
```

`access` menerima: `owner`, `premium`, `group`, `private`, `admin`, `botAdmin`.
Tambahkan `async passive(env) {}` untuk plugin yang jalan di setiap pesan.

### `ctx`

| | |
|---|---|
| `reply(teks \| buffer \| object, opts)` | buffer otomatis dikenali (gambar, video, audio, dokumen) |
| `adReply(teks, { title, body })` | balasan dengan kartu pratinjau |
| `card(teks, { buttons })` | kartu besar: gambar + promo + tombol (default tombol Website) |
| `react(emoji)` · `edit(sent, teks)` · `delete()` | |
| `fetchMedia()` | media dari pesan ini atau pesan yang di-reply |
| `args` · `argsStr` · `command` · `prefix` | |
| `senderId` · `senderPn` · `senderLid` · `senderNumber` | `senderId` = nomor bila diketahui, kalau tidak LID |
| `isGroup` · `mentionedJid` · `quotedText` · `quotedType` | |

## Tampilan balasan

- `ctx.reply(teks)` → kartu pratinjau (gambar kecil di kiri, diambil acak dari `config/reply/`). Dua mode: kecil (default) dan penuh/gambar besar lewat `{ preview: { large: true } }` (dipakai `.profil`). Isi kartu bisa diubah: `{ preview: { title, body, thumbnail } }`. Matikan dengan `{ preview: false }`.
- Menu: satu pesan, satu tombol "リストメニュー" berisi sub-list Utama / Kategori / Support + baris ↩ Semua Kategori (disusun langsung di `plugins/general/menu.js`).
- Level up: notifikasi otomatis (`features.levelUpNotif`). Donasi: satu pesan produk katalog (`donate.catalog` di `config.json`), nomor DANA/GoPay di isi pesan, gambar produk = `config/qris.jpg` bila ada.
- `ctx.card()` / `sendInteractive()` → gambar besar + promo (`config.json → promo`) + tombol. List dikirim sebagai satu daftar datar.
- Semua pesan keluar diberi label diteruskan dari channel: `newsletterJid`, `ChannelName`, dan `channel` (link, isi URL asli) di `config.json`.

## Migrasi

Database sekarang di `database/`. File lama di `lib/database/*.json` disalin otomatis saat run pertama. Folder `session/` lama tetap bisa dipakai. Jika bot tidak mengenali Anda sebagai owner, isi `ownerLids` dengan LID Anda (lihat lewat `.eval ctx.senderLid`).
