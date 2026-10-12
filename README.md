# Miyako-BA (Tsukiyuki Miyako)

> Bot WhatsApp modular berbasis **plugin** di atas **[@zavedyaid/baileys](https://www.npmjs.com/package/@zavedyaid/baileys)**, dengan hot-reload tanpa build-step, pesan interaktif (list, katalog, promo, forward dari channel), router API **api.zavedya.id**, serta sistem limit, level, dan EXP bawaan.

---

## 📑 Daftar Isi

- [Fitur Utama](#-fitur-utama)
- [Arsitektur & Struktur Direktori](#-arsitektur--struktur-direktori)
- [Prasyarat Sistem](#-prasyarat-sistem)
- [Panduan Instalasi & Menjalankan Bot](#-panduan-instalasi--menjalankan-bot)
  - [Instalasi di Linux / VPS (Ubuntu/Debian)](#1-instalasi-di-linux--vps-ubuntudebian)
  - [Instalasi di Termux (Android)](#2-instalasi-di-termux-android)
  - [Konfigurasi Awal (`config.json`)](#3-konfigurasi-awal-configjson)
  - [Menghubungkan WhatsApp (Pairing / QR)](#4-menghubungkan-whatsapp-pairing--qr)
  - [Manajemen Proses (PM2)](#5-manajemen-proses-pm2)
- [Panduan Pengembangan Plugin (`definePlugin`)](#-panduan-pengembangan-plugin-defineplugin)
  - [Struktur & Opsi Plugin](#struktur--opsi-plugin)
  - [Payload Argumen `run()`](#payload-argumen-run)
  - [Helper `ctx`](#helper-ctx)
  - [Contoh Implementasi Plugin](#contoh-implementasi-plugin)
- [Pesan Interaktif (`sendInteractive`)](#-pesan-interaktif-sendinteractive)
- [Router API (`lib/api.js`)](#-router-api-libapijs)
- [Konfigurasi Bot (`config.json`)](#-konfigurasi-bot-configjson)
- [Daftar Fitur](#-daftar-fitur)
- [Perintah Owner](#-perintah-owner)
- [Sistem Limit, Level & EXP](#-sistem-limit-level--exp)
- [Kredit & Lisensi](#-kredit--lisensi)

---

## ✨ Fitur Utama

- **Plugin Modular dengan Hot-Reload**: Setiap file di `plugins/<kategori>/` dipindai otomatis. Menambah atau mengubah plugin langsung aktif tanpa me-restart bot.
- **Pesan Interaktif Bawaan Fork**: Gambar header, baris promo, tombol URL / salin / balas cepat, serta **List Menu** bertingkat (Utama, Kategori, Support) lewat `nativeFlow` `@zavedyaid/baileys`.
- **Menu Bertingkat**: Satu tombol *List Menu* berisi sub-list, baris balas ↩ langsung, dan daftar kategori yang dibuat otomatis dari plugin yang terpasang.
- **Kartu Balasan Konsisten**: Semua balasan me-reply kontak palsu *WhatsApp Business • Status*, teks biasa tampil sebagai kartu link-preview (gambar acak dari `config/reply/`), dan semua pesan keluar ditandai **diteruskan dari channel**.
- **Router API Zavedya**: `lib/api.js` hanya menyambung ke `api.zavedya.id` (GET/POST). Tiap plugin menyebut endpoint dan mengolah responsnya sendiri — 58 plugin siap pakai untuk AI, downloader, search, stalker, wiki, dan tools.
- **Alur Lagu 3 Langkah**: `.play <judul>` → pilih lagu dari list → lirik dengan link preview → lagunya (MP3).
- **Stiker 1:1**: Gambar, video, GIF, atau stiker jadi stiker persegi dengan crop tengah (`.s fit` tanpa crop).
- **Limit, Level & EXP**: Limit harian per pengguna, notifikasi naik level otomatis, dan akses premium.
- **Donasi via Katalog WhatsApp**: `.donasi` mengirim satu pesan produk katalog dengan nomor e-wallet di dalamnya.
- **Kontrol Akses per Command**: Batasan `access` (owner, premium, grup, private, admin, bot-admin) per plugin, pesan lama diabaikan (`behavior.staleAfterSeconds`), dan saran command bila salah ketik.

---

## 📂 Arsitektur & Struktur Direktori

```text
├── main.js                   # Boot, koneksi, reconnect otomatis, scheduler
├── handler.js                # Alur pesan masuk + seluruh middleware
├── events.js                 # Sambutan grup, buka/tutup, anti-delete, anti-call
├── config/
│   ├── config.json           # File konfigurasi utama
│   ├── thumbnail.jpg         # Gambar header pesan interaktif
│   ├── reply/                # Gambar acak untuk kartu link-preview balasan
│   └── qris.jpg              # (opsional) Gambar QRIS untuk .donasi
├── lib/                      # Inti bot (tidak di-hot-reload — wajib restart)
│   ├── api.js                # Router api.zavedya.id (api.get / api.post)
│   ├── baileys.js            # Satu pintu import library Baileys
│   ├── channel.js            # Label "diteruskan dari channel" di semua pesan
│   ├── config.js             # Loader konfigurasi
│   ├── database.js           # Database JSON lokal
│   ├── extract.js            # Pembantu membaca respons API (teks, daftar, media, profil)
│   ├── groups.js             # Cache grup + cek admin
│   ├── interactive.js        # Pesan gambar + promo + tombol/list
│   ├── levelup.js            # Notifikasi naik level
│   ├── logger.js             # Log & banner
│   ├── plugins.js            # definePlugin + loader (hot-reload)
│   ├── serialize.js          # Pesan mentah → ctx
│   ├── songs.js              # Cache hasil .play untuk .ytplay
│   ├── sticker.js            # Media → stiker
│   ├── upload.js             # Unggah gambar ke cdn.zavedya.id → link
│   └── utils.js              # jid, waktu, teks, media, cache, http
└── plugins/                  # Seluruh command (hot-reload)
    ├── general/              # menu, ping, profil, afk, owner, donate
    ├── ai/                   # gemini, claude, gpt, deepseek, glm, kimi, qwen, … (17)
    ├── downloader/           # play, ytplay, ytmp3, ytmp4, tiktok, spotify, … (12)
    ├── search/               # pinterest, konachan, dafont, dramabox, gnews, lirik, … (8)
    ├── stalker/              # githubstalk, tiktokstalk, youtubestalk, … (5)
    ├── wiki/                 # hok, wuwa (2)
    ├── tools/                # removebg, converter, tempmail (3)
    ├── maker/                # sticker
    └── owner/                # eval, exec, restart, setmode
```

Import antar-modul memakai alias, contoh `import { db } from "#lib/database"`.

> ⚠️ **Hot-reload hanya untuk `plugins/`.** Mengubah file di `lib/`, `handler.js`, `events.js`, `main.js`, atau `config/` wajib **Restart** bot. Bila hanya sebagian file yang diganti, plugin yang di-reload tetap memakai `lib/` versi lama di memori dan muncul error `does not provide an export named …`.

---

## ⚙️ Prasyarat Sistem

- **Node.js**: Versi `20.11` atau lebih baru (`v22.x` LTS direkomendasikan).
- **FFmpeg**: Diperlukan untuk stiker (termasuk animasi WebP) dan pembuatan thumbnail.
- **Git**: Untuk instalasi dan sinkronisasi source code.
- **RAM**: Minimal 256 MB (direkomendasikan 512 MB+).

---

## 🚀 Panduan Instalasi & Menjalankan Bot

### 1. Instalasi di Linux / VPS (Ubuntu/Debian)

```bash
# Update repository & install paket pendukung
sudo apt update && sudo apt upgrade -y
sudo apt install ffmpeg git -y

# Install Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install nodejs -y

# Clone repository
git clone https://github.com/ZavedyaID/Miyako-BA.git
cd Miyako-BA

# Install dependensi Node.js
npm install
```

### 2. Instalasi di Termux (Android)

```bash
# Update paket Termux
pkg update && pkg upgrade -y
pkg install nodejs-lts ffmpeg git -y

# Clone repository
git clone https://github.com/ZavedyaID/Miyako-BA.git
cd Miyako-BA

# Install dependensi
npm install
```

### 3. Konfigurasi Awal (`config.json`)

Buka dan sesuaikan berkas `config/config.json`:

```json
{
  "name": "Miyako - BA",
  "owner": "NamaKamu",
  "number": "",
  "prefix": "^[.]",
  "timezone": "Asia/Jakarta",
  "ownerNumbers": ["628xxxxxxxxxx"],
  "newsletterJid": "120363xxxxxxxxxx@newsletter",
  "channel": "https://whatsapp.com/channel/xxxxxxxx",
  "ChannelName": "Nama Channel Kamu",
  "limit": { "default": 25 },
  "features": {
    "selfMode": false,
    "antiCall": false,
    "statusReact": false,
    "cmdSuggest": true,
    "levelUpNotif": true
  },
  "api": { "baseUrl": "https://api.zavedya.id", "timeout": 60000 }
}
```

> 💡 **Catatan Konfigurasi:**
> - `ownerNumbers` wajib diisi dengan nomor owner (format kode negara, tanpa `+`).
> - `newsletterJid`, `channel`, dan `ChannelName` dipakai untuk label **diteruskan dari channel**; `channel` harus berupa URL agar tombol *Channel* muncul.
> - Berkas dibaca saat bot menyala. Setelah mengubah `config.json`, **Restart** bot.
> - Isi `donate` (nomor DANA/GoPay, link katalog) dan taruh gambar QRIS di `config/qris.jpg` untuk fitur `.donasi`.

### 4. Menghubungkan WhatsApp (Pairing / QR)

Jalankan bot melalui terminal:

```bash
npm start
```

1. Terminal menanyakan **Login pakai pairing code? [y/N]**.
2. Jawab `y` untuk **Pairing Code** (direkomendasikan), lalu masukkan nomor WhatsApp bot dengan kode negara (contoh: `62812xxxxxxxx`, atau isi `number` di `config.json` agar tidak ditanya).
3. Masukkan kode yang muncul di terminal ke WhatsApp:
   - Buka WhatsApp di ponsel ➔ **Perangkat Tertaut** ➔ **Tautkan Perangkat** ➔ **Tautkan dengan nomor telepon saja**.
4. Jawab `n` bila ingin memakai **QR Code**, lalu pindai QR yang tampil di terminal.
5. Sesi tersimpan di folder `session/`.

> **Troubleshooting Sesi:** Bila koneksi terputus terus atau sesi korup, hapus folder `session/` lalu jalankan ulang bot. Bot akan menyambung ulang otomatis bila koneksi terputus biasa.

### 5. Manajemen Proses (PM2)

Gunakan PM2 untuk menjaga bot tetap berjalan di latar belakang dan auto-restart saat server reboot:

```bash
# Install PM2 secara global
npm install -g pm2

# Jalankan bot dengan PM2
pm2 start main.js --name "miyako"

# Simpan state PM2
pm2 save
pm2 startup
```

Mode pengembangan (restart otomatis saat `lib/`, `handler.js`, atau `events.js` berubah):

```bash
npm run dev
```

---

## 🛠️ Panduan Pengembangan Plugin (`definePlugin`)

Tambahkan file `.js` baru di `plugins/<kategori>/` — langsung aktif tanpa restart. File berawalan `_` diabaikan. Kategori menu dibuat otomatis dari field `category`.

### Struktur & Opsi Plugin

```js
import { definePlugin } from "#lib/plugins";

export default definePlugin({
  name: "namacmd",             // Nama command (wajib, otomatis huruf kecil)
  aliases: ["alias"],          // Nama lain pemanggil command
  category: "tools",           // Kategori menu (ai, downloader, search, tools, dll)
  description: "Deskripsi",    // Deskripsi singkat
  usage: "namacmd <teks>",     // Contoh pemakaian
  limit: 1,                    // Biaya limit per pemakaian (0 = gratis)
  exp: 10,                     // EXP yang didapat per pemakaian
  hidden: false,               // true = tidak tampil di menu
  access: {                    // Batasan akses
    owner: false,              // Khusus owner
    premium: false,            // Khusus premium
    group: false,              // Hanya di grup
    private: false,            // Hanya di private chat
    admin: false,              // Pengirim harus admin grup
    botAdmin: false,           // Bot harus admin grup
  },
  async run({ ctx, sock, db, config, registry, user, role }) {
    // Logika fitur ditulis di sini
  },
  // Opsional: dijalankan untuk SETIAP pesan (mis. AFK, anti-link), bukan hanya command
  // async passive(env) {},
});
```

> Plugin boleh hanya memakai `passive` tanpa `run`. Bila `run` melempar error, handler membalas pesan error dan **mengembalikan limit**.

### Payload Argumen `run()`

| Parameter | Tipe | Deskripsi |
| :--- | :--- | :--- |
| `ctx` | `Object` | Pesan terurai: teks, pengirim, argumen, media, serta helper balasan (lihat tabel di bawah) |
| `sock` | `Object` | Instance socket `@zavedyaid/baileys` |
| `msg` | `Object` | Pesan mentah dari Baileys |
| `db` | `Object` | Database JSON (`db.users`, `db.groups`, `db.settings`, `db.stats`, `db.save(tabel)`) |
| `config` | `Object` | Isi `config/config.json` |
| `registry` | `Object` | Daftar plugin terpasang (`registry.categories()`, `registry.resolve(nama)`) |
| `user` | `Object` | Data pengguna pengirim (`limit`, `level`, `exp`, `afk`, …) |
| `chat` | `Object` | Data chat / grup saat ini |
| `role` | `Object` | `{ owner, premium }` status pengirim |
| `group()` | `Function` | `await group()` → info grup (`isAdmin`, `isBotAdmin`, …) |

### Helper `ctx`

| Properti / Fungsi | Deskripsi |
| :--- | :--- |
| `ctx.chatId`, `ctx.senderId`, `ctx.senderNumber`, `ctx.pushName` | Identitas chat dan pengirim |
| `ctx.isGroup`, `ctx.fromMe` | Penanda grup / pesan dari bot sendiri |
| `ctx.prefix`, `ctx.command`, `ctx.args`, `ctx.argsStr`, `ctx.hasArgs` | Prefix, nama command, dan argumen (array / string) |
| `ctx.text`, `ctx.quotedText`, `ctx.quotedSender`, `ctx.mentionedJid` | Teks pesan, teks & pengirim pesan yang di-reply, serta mention |
| `ctx.hasMedia`, `ctx.fetchMedia()` | Cek media; `fetchMedia()` → `{ buffer, kind, mimetype }` (dari pesan atau yang di-reply) |
| `ctx.reply(isi, opsi)` | Balas pesan. Opsi: `quoted` (`true` pesan asli · `false` tanpa reply), `preview` (`false` atau `{ title, body, thumbnail, large, url }`), `mentions` |
| `ctx.card(teks, opsi)` | Kartu besar: gambar + promo + tombol |
| `ctx.adReply(teks, opsi)` | Balasan dengan kartu pratinjau kustom |
| `ctx.react(emoji)`, `ctx.edit(pesan, teks)`, `ctx.delete(key)`, `ctx.typing()` | Reaksi, edit, hapus, indikator mengetik |

### Contoh Implementasi Plugin

#### 1. Command Sederhana (Teks & Utilitas)

```js
import { definePlugin } from "#lib/plugins";

export default definePlugin({
  name: "say",
  aliases: ["echo"],
  category: "tools",
  description: "Bot mengulang teksmu",
  usage: "say <teks>",
  async run({ ctx }) {
    if (!ctx.hasArgs) return ctx.reply(`❌ Contoh: *${ctx.prefix}say halo*`);
    await ctx.reply(ctx.argsStr);
  },
});
```

#### 2. Command Pengolah Media (Stiker)

```js
import { definePlugin } from "#lib/plugins";
import { makeSticker } from "#lib/sticker";

export default definePlugin({
  name: "s",
  aliases: ["stiker", "sticker"],
  category: "maker",
  description: "Ubah gambar/video jadi stiker 1:1",
  limit: 1,
  async run({ ctx, config }) {
    const media = await ctx.fetchMedia();
    if (!media || !["image", "video"].includes(media.kind)) {
      return ctx.reply(`❌ Kirim / reply gambar atau video dengan caption *${ctx.prefix}s*`);
    }
    const sticker = await makeSticker(media.buffer, {
      animated: media.kind === "video",
      packname: config.sticker.packname,
      author: config.sticker.author,
    });
    await ctx.reply(sticker, { type: "sticker" });
  },
});
```

#### 3. Command yang Memanggil API Zavedya

```js
import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";

export default definePlugin({
  name: "gemini",
  aliases: ["gem"],
  category: "ai",
  description: "Tanya Google Gemini",
  usage: "gemini <pertanyaan>",
  limit: 1,
  async run({ ctx }) {
    const prompt = ctx.argsStr || ctx.quotedText;
    if (!prompt) return ctx.reply(`❌ Contoh: *${ctx.prefix}gemini jelaskan AI*`);

    ctx.react("⏳");
    try {
      const data = await api.get("/ai/gemini", { prompt, model: "gemini-3.6-flash" });
      if (!data.text) throw new ApiError("Jawaban kosong dari API.");
      await ctx.reply(data.text);
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
```

---

## 🔘 Pesan Interaktif (`sendInteractive`)

`lib/interactive.js` membungkus API `nativeFlow` fork: satu pesan = gambar header + baris promo + teks + tombol. Promo diatur di `config.json → promo` dan selalu ikut kecuali `offer: false`.

```js
import { sendInteractive } from "#lib/interactive";

await sendInteractive(sock, ctx.chatId, {
  text: "Pilih salah satu 👇",
  buttons: [
    { type: "url", text: "🌐 Website", url: "https://zavedya.id" },
    { type: "copy", text: "📋 Salin", code: "ZavedyaID" },
    { type: "quick", text: "📋 Menu", id: ".menu" },
    {
      type: "list",
      text: "📂 Pilih",
      sections: [{ title: "Utama", rows: [{ title: "🏓 Ping", description: "Cek status", id: ".ping" }] }],
    },
  ],
  mentions: [ctx.senderId],
});
```

| Opsi | Deskripsi |
| :--- | :--- |
| `text` | Isi pesan (caption gambar) |
| `buttons` | Tombol `url`, `copy`, `call`, `quick`, atau `list` |
| `wrap` | `{ text, title }` — bungkus semua tombol jadi satu tombol yang membuka sheet baris ↩ (sekali tap langsung jalan) |
| `image` | Buffer gambar header (default `config/thumbnail.jpg`) |
| `offer` | `false` untuk mematikan baris promo |
| `quoted`, `mentions`, `footer` | Reply, mention, dan footer pesan |

Id baris (`id`) dijalankan sebagai command saat dipilih, misalnya `.menu all`.

---

## 🔌 Router API (`lib/api.js`)

Router hanya **menyambung** ke `https://api.zavedya.id` dan mengembalikan JSON mentah. Tidak ada daftar endpoint di sini — setiap plugin menyebut path dan parameternya sendiri.

```js
const data = await api.get("/search/pinterest", { query: "aesthetic wallpaper", limit: 20 });
// → GET https://api.zavedya.id/v1/search/pinterest?query=aesthetic+wallpaper&limit=20

const hasil = await api.post("/ai/nanobanana", { prompt, imageUrl }); // body JSON
```

- Header `User-Agent` dikirim otomatis (wajib untuk API ini), dengan batas waktu dari `config.api.timeout`.
- HTTP gagal atau `status` bukan `success` melempar `ApiError` — handler menampilkannya sebagai pesan ❌ dan mengembalikan limit.
- `lib/extract.js` berisi pembantu membaca respons di plugin (`pickText`, `listOf`, `collectMedia`, `profileLines`, dll).
- `lib/upload.js` mengunggah gambar WhatsApp ke `https://cdn.zavedya.id/upload` agar API yang butuh `imageUrl` (removebg, nanobanana, converter) bisa dipakai dari gambar.

> API Zavedya membatasi permintaan berulang dari IP + User-Agent yang sama (cooldown 10 menit). Hindari memanggil endpoint yang tidak perlu dari satu command.

---

## 🧰 Konfigurasi Bot (`config.json`)

| Kunci | Fungsi & Deskripsi |
| :--- | :--- |
| `name`, `owner`, `version` | Nama bot, nama owner, dan versi |
| `number` | Nomor bot untuk pairing code (kosong = ditanya saat start) |
| `prefix` | Regex prefix command (bawaan `^[.]`) |
| `timezone` | Zona waktu untuk sapaan dan jam |
| `ownerNumbers`, `ownerLids` | Daftar nomor / LID owner |
| `newsletterJid`, `channel`, `ChannelName` | Label diteruskan dari channel + tombol Channel |
| `limit.default` | Limit harian awal tiap pengguna |
| `behavior.staleAfterSeconds` | Pesan yang lebih lama dari ini diabaikan |
| `features.selfMode` | `true` = hanya owner yang bisa memakai bot |
| `features.antiCall` | Tolak panggilan masuk |
| `features.statusReact` | Reaksi otomatis ke status |
| `features.cmdSuggest` | Saran command bila salah ketik |
| `features.levelUpNotif` | Notifikasi naik level otomatis |
| `promo` | Baris promo di pesan interaktif (`text`, `code`, `url`, `hours`) |
| `social` | Link website, GitHub, dan grup |
| `sticker` | `packname` dan `author` stiker |
| `api` | `baseUrl` dan `timeout` router API |
| `donate` | `catalog`, `title`, `description`, `text`, `accounts`, `links` untuk `.donasi` |

---

## 📋 Daftar Fitur

| Kategori | Command |
| :--- | :--- |
| **general** | `.menu`, `.ping`, `.profil`, `.afk`, `.owner`, `.donasi` |
| **ai** | `.gemini`, `.claude`, `.gpt`, `.deepseek`, `.glm`, `.kimi`, `.qwen`, `.minimax`, `.hunyuan`, `.stepfun`, `.sonus`, `.agnes`, `.coding`, `.free`, `.aimodels`, `.flux` (gambar), `.nanobanana` (edit gambar) |
| **downloader** | `.play` (list lagu → lirik → audio), `.ytmp3`, `.ytmp4`, `.tiktok`, `.dailymotion`, `.likee`, `.rednote`, `.pindl`, `.soundcloud`, `.spotify`, `.mediafire`, `.terabox` |
| **search** | `.pinterest`, `.konachan`, `.dafont`, `.dramabox`, `.gnews`, `.scsearch`, `.yts`, `.lirik` |
| **stalker** | `.githubstalk`, `.tiktokstalk`, `.youtubestalk`, `.instagramstalk`, `.twitterstalk` |
| **wiki** | `.hok` (Honor of Kings), `.wuwa` (Wuthering Waves) |
| **tools** | `.removebg`, `.converter`, `.tempmail` |
| **maker** | `.s` / `.stiker` (1:1; `.s fit` tanpa crop) |

Contoh:

```text
.play virgoun surat cinta untuk starla
.pin aesthetic wallpaper | 8
.ytmp4 https://youtu.be/xxxx 720
.lirik Virgoun | Surat Cinta Untuk Starla
.removebg  (kirim / reply gambar)
```

> Nama parameter beberapa endpoint (mis. `converter`, `nanobanana`, stalker, wiki) mengikuti dugaan awal. Bila ada yang gagal, sesuaikan satu baris `PATH` / parameter di plugin terkait — hanya plugin itu yang perlu diubah.

---

## 👑 Perintah Owner

Khusus nomor di `ownerNumbers` (`access: { owner: true }`):

```text
• .setmode <self|public>
> Ubah mode bot: self (hanya owner) atau public

• .restart
> Simpan database lalu restart bot (otomatis bila dijalankan lewat PM2)

• .eval <kode>   (alias: .ev, >)
> Jalankan kode JavaScript di dalam proses bot

• .exec <perintah>   (alias: .sh, $)
> Jalankan perintah shell di server
```

> ⚠️ `.eval` dan `.exec` memberi kendali penuh atas server. Pastikan `ownerNumbers` hanya berisi nomor yang kamu percaya.

---

## 🎚️ Sistem Limit, Level & EXP

- Tiap pengguna mendapat **limit** awal dari `limit.default`. Command dengan `limit: N` memotong N limit; **premium dan owner tidak dipotong**. Limit dikembalikan bila command gagal.
- Setiap pesan dan pemakaian command menambah **EXP**. Saat EXP cukup, pengguna naik **level** dan bot mengirim notifikasi 🎉 LEVEL UP (matikan lewat `features.levelUpNotif`).
- Data pengguna disimpan sebagai JSON di folder `database/`.

---

## 👥 Kredit & Lisensi

- **ZavedyaID** — Developer & pemilik project  
  [Website](https://zavedya.id) • [GitHub](https://github.com/ZavedyaID)
- **[WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys)** dan **Lia Wynn (itsliaaa)** — fondasi library yang dipakai fork `@zavedyaid/baileys`.
- Susunan dokumentasi ini terinspirasi dari README **Experimental-Bell** oleh Rifza.

Project ini dilisensikan di bawah [MIT License (Modified)](./LICENSE) © ZavedyaID — **tidak boleh dijual atau dipakai untuk tujuan komersial tanpa izin tertulis dari pemegang hak cipta.**
