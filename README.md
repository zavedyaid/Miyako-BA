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
- [Registrasi Pengguna](#-registrasi-pengguna)
- [Game RPG](#-game-rpg)
- [Kartu Gambar](#-kartu-gambar)
- [Perintah Owner](#-perintah-owner)
- [Sistem Limit, Level & EXP](#-sistem-limit-level--exp)
- [Kredit & Lisensi](#-kredit--lisensi)

---

## ✨ Fitur Utama

- **Plugin Modular dengan Hot-Reload**: Setiap file di `plugins/<kategori>/` dipindai otomatis. Menambah atau mengubah plugin langsung aktif tanpa me-restart bot.
- **Pesan Interaktif Bawaan Fork**: Gambar header, baris promo, tombol URL / salin / balas cepat, serta **List Menu** bertingkat (Utama, Kategori, Support) lewat `nativeFlow` `@zavedyaid/baileys`.
- **Menu Bertingkat**: Satu tombol *List Menu* berisi sub-list, baris balas ↩ langsung, dan daftar kategori yang dibuat otomatis dari plugin yang terpasang.
- **Kartu Balasan Konsisten**: Semua balasan me-reply kontak palsu *WhatsApp Business • Status*, teks biasa tampil sebagai kartu link-preview (gambar acak dari `config/reply/`), dan semua pesan keluar ditandai **diteruskan dari channel**.
- **Router API Zavedya**: `lib/api.js` hanya menyambung ke `api.zavedya.id` (GET/POST). Tiap plugin menyebut endpoint dan mengolah responsnya sendiri — 102 command + AutoAI siap pakai untuk AI, downloader, search, stalker, wiki, tools, manajemen grup, dan owner.
- **Alur Lagu 3 Langkah**: `.play <judul>` → pilih lagu dari list → lirik dengan link preview → lagunya (MP3).
- **Stiker 1:1**: Gambar, video, GIF, atau stiker jadi stiker persegi dengan crop tengah (`.s fit` tanpa crop).
- **Registrasi Wajib**: `.register` (nama → umur → gender) lalu pengguna mendapat **kartu register** bergambar lengkap dengan nomor SN dan nomor kartu. Command (termasuk AutoAI) hanya bisa dipakai setelah terdaftar; owner dikecualikan.
- **Game RPG Lengkap**: Tas (`.inv`), status hero, berburu, dungeon + boss, menambang, memancing, toko, tempa, hadiah harian/mingguan/peti, driver **ojol / gocar / gofood**, lawan pemain via tag (**duel, balap, rampok, suit PvP**), dan **leaderboard** multi-kategori — semuanya tampil sebagai **kartu gambar** dan hanya bisa dipakai di grup.
- **Kartu Bergaya Kaca**: Register, profil, welcome, goodbye, level-up, hero, tas/toko, dan hasil aksi RPG memakai gaya yang sama (dirender ffmpeg + font Poppins).
- **Foto Profil di Kartu Balasan**: Gambar di kartu *WhatsApp Business • Status* adalah foto profil pengirim perintah.
- **Sapaan Owner**: Bot menyapa setiap owner chat di grup (dengan jeda agar tidak spam).
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
│   ├── logger.js             # Log & banner konsol (ASCII art maskot + nama bot + kredit)
│   ├── banner-art.js         # Seni ASCII hasil tools/make-banner-art.py (jangan diedit manual)
│   ├── plugins.js            # definePlugin + loader (hot-reload)
│   ├── serialize.js          # Pesan mentah → ctx
│   ├── songs.js              # Cache hasil .play untuk .ytplay
│   ├── sticker.js            # Media → stiker
│   ├── targets.js            # Target @mention / reply / nomor + pencocokan anggota grup
│   ├── access.js             # Aturan akses command (dipakai handler & AutoAI)
│   ├── exec.js               # Eksekusi command: akses → limit → run → pesan limit (handler & AutoAI)
│   ├── groupstatus.js        # Status grup media (gambar / video / voice note) lewat relay manual
│   ├── cards.js              # Render kartu (welcome, goodbye, levelup, register, profile, hero, grid, result) — ffmpeg + font Poppins
│   ├── register.js           # Registrasi: sesi tanya-jawab, SN/nomor kartu, gerbang "wajib terdaftar"
│   ├── ownergreet.js         # Sapaan saat owner chat di grup
│   ├── rpg.js                # Data & aturan game RPG (item, monster, harga, hadiah)
│   ├── rpgui.js              # Kartu & caption RPG (tas, toko, hero, hasil aksi)
│   ├── media.js              # audio → video untuk status grup
│   ├── vision.js             # AI membaca gambar / video (frame) + fallback antar-model
│   ├── autoai.js             # AutoAI: karakter Tsukiyuki Miyako, riwayat, pemicu grup
│   ├── http.js               # fetch aman untuk .get/.post (blokir alamat lokal/privat, batas ukuran)
│   ├── upload.js             # Unggah file ke cdn.zavedya.id → link (uploadFile / uploadImage)
│   └── utils.js              # jid, waktu, teks, media, cache, http
└── plugins/                  # Seluruh command (hot-reload)
    ├── general/              # menu, ping, profil, register (+ kartu, unreg), afk, owner, donate
    ├── ai/                   # gemini, claude, gpt, deepseek, glm, kimi, qwen, … (17)
    ├── downloader/           # play, ytplay, ytmp3, ytmp4, tiktok, spotify, … (12)
    ├── search/               # pinterest, konachan, dafont, dramabox, gnews, lirik, … (8)
    ├── stalker/              # githubstalk, tiktokstalk, youtubestalk, … (5)
    ├── wiki/                 # hok, wuwa (2)
    ├── tools/                # removebg, converter, tempmail, tourl, cekidch, get/post/put/patch/delete/head, curl (12)
    ├── group/                # tagall, hidetag, add, kick, promote, demote, set, on/off, swgc, … (16)
    ├── rpg/                  # inv, rpg, berburu, dungeon, nambang, mancing, daily, weekly, peti, toko, beli, jual, pakai, equip, tempa, ojol, gocar, gofood, balap, suitpvp, leaderboard
    ├── maker/                # sticker
    └── owner/                # eval, exec, restart, setmode, plugin manager, akses, join/leave, cardtest (19)
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
  }
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

- Header `User-Agent` dikirim otomatis (wajib untuk API ini), dengan batas waktu `API_TIMEOUT` (alamat `API_BASE` dan batas waktu diatur di bagian atas `lib/api.js`, bukan di config.json).
- HTTP gagal atau `status` bukan `success` melempar `ApiError` — handler menampilkannya sebagai pesan ❌ dan mengembalikan limit.
- `lib/extract.js` berisi pembantu membaca respons di plugin (`pickText`, `listOf`, `collectMedia`, `profileLines`, dll).
- `lib/upload.js` mengunggah gambar / video / audio / dokumen WhatsApp ke `https://cdn.zavedya.id/upload` agar API yang butuh `imageUrl` (removebg, nanobanana, converter) bisa dipakai dari gambar.

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
| `features.registerRequired` | `true` (bawaan) = wajib `.register` sebelum memakai bot; `false` = bebas |
| `features.ownerGreet` | Bot menyapa saat owner chat di grup (per grup: `.on` / `.off ownergreet`) |
| `ownerGreet.cooldownMinutes` | Jeda sapaan per owner per grup (bawaan `30`, `0` = setiap pesan owner) |
| `features.cardChannelLabel` | `false` (bawaan) = gambar kartu dikirim bersih tanpa label "diteruskan dari channel" (label itu membuatnya tampak seperti link-preview); `true` = tetap berlabel |
| `features.senderThumb` | `false` = gambar kartu balasan kembali acak (bukan foto profil pengirim) |
| `promo` | Baris promo di pesan interaktif (`text`, `code`, `url`, `hours`) |
| `social` | Link website, GitHub, dan grup |
| `sticker` | `packname` dan `author` stiker |
| `donate` | `catalog`, `title`, `description`, `text`, `accounts`, `links` untuk `.donasi` |

---

## 📋 Daftar Fitur

| Kategori | Command |
| :--- | :--- |
| **general** | `.menu`, `.sc` (info script + tombol GitHub), `.ping`, `.register`, `.kartu`, `.unreg`, `.profil` (kartu), `.level` (kartu level & progres EXP; alias `.rank` `.exp`), `.afk`, `.owner`, `.donasi`, `.tqto` |
| **ai** | `.gemini`, `.claude`, `.gpt`, `.deepseek`, `.glm`, `.kimi`, `.qwen`, `.minimax`, `.hunyuan`, `.stepfun`, `.sonus`, `.agnes`, `.coding`, `.free`, `.aimodels`, `.flux` (gambar), `.nanobanana` (edit gambar) |
| **downloader** | `.play` (list lagu → lirik → audio), `.ytmp3`, `.ytmp4`, `.tiktok` (`.tt`: tanpa watermark + caption lengkap + musik MP3), `.dailymotion`, `.likee`, `.rednote`, `.pindl`, `.soundcloud`, `.spotify`, `.mediafire`, `.terabox` |
| **search** | `.pinterest`, `.konachan`, `.dafont`, `.dramabox`, `.gnews`, `.scsearch`, `.yts`, `.lirik` |
| **stalker** | `.githubstalk`, `.tiktokstalk`, `.youtubestalk`, `.instagramstalk`, `.twitterstalk` |
| **wiki** | `.hok` (Honor of Kings), `.wuwa` (Wuthering Waves) |
| **tools** | `.removebg`, `.converter`, `.tempmail`, `.tourl` (unggah media / link file ke CDN → link), `.cekidch` (ID & detail lengkap channel), `.get` `.post` `.put` `.patch` `.delete` `.head` `.curl` (premium) |
| **group** | `.tagall`, `.hidetag`, `.add`, `.kick` (`.dor`), `.promote`, `.demote`, `.open`, `.close`, `.linkgc`, `.revoke`, `.infogc`, `.listadmin`, `.set`, `.on` / `.off`, `.swgc` |
| **ai** (tambahan) | AutoAI Miyako (balas otomatis), `.resetai` |
| **rpg** | `.inv` (`.inventory` `.tas`), `.rpg` (`.hero`; `.rpg help`), `.atm`, `.setpin`, `.deposit`, `.tarik`, `.transfer`, `.kerja`, `.misi`, `.ojol`, `.gocar`, `.gofood`, `.duel`, `.balap`, `.suitpvp`, `.rampok`, `.buy`, `.sell`, `.berburu`, `.dungeon`, `.nambang`, `.mancing`, `.daily`, `.weekly`, `.peti`, `.toko`, `.beli`, `.jual`, `.pakai`, `.equip`, `.unequip`, `.tempa`, `.leaderboard` (`.top` `.lb`) |
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

Khusus owner (`ownerNumbers` di config.json **atau** yang ditambah lewat `.addowner`):

```text
• .setmode <self|public>        • .restart
• .eval <kode> (.ev, >)         • .exec <perintah> (.sh, $)

Plugin (langsung aktif, hot-reload)
• .addplugin <nama|kategori/nama> (.sf, .saveplugin)
> Simpan plugin baru ATAU perbarui yang sudah ada. Kode dari reply teks,
> file .js yang dikirim, atau ditulis setelah nama. Sintaks dicek dulu; kalau gagal
> dimuat, otomatis kembali ke versi lama. Cadangan: database/plugin-backup/
• .getplugin <nama> (.gp)       • .delplugin <nama> (.dp)       • .listplugin [kategori]

Akses
• .addowner / .delowner / .listowner
• .addprem <target> [hari|perm] / .delprem / .listprem   (default 30 hari)
• .ban / .unban <target>
> Target: @mention, reply pesan, atau nomor (62812… / 0812…)

Grup
• .join <link grup>             • .leave

```

### Pengaturan: `.set` dan `.on` / `.off`

Dua command ini punya dua "lingkup": **group** (admin grup, di dalam grup) dan **owner** (khusus owner).

```text
.set group name <teks>            .set owner name <teks>      (nama profil bot)
.set group desc <teks|->          .set owner bio <teks>
.set group pp (kirim/reply gambar) .set owner pp (kirim/reply gambar)
.set group welcome <teks|reset>   .set owner mode <self|public>
                                  .set owner autoread <all|group|private|off>
                                  .set owner cardstyle <preview|image>
.set group goodbye <teks|reset>   .set owner persona <teks|reset>   (karakter AutoAI)
(variabel: @user @subject @count @desc @author)   .set owner aimodel <gemini|gpt|claude|…>
Singkatan: .setbio  .setwelcome  .setgoodbye  .setname  .setdesc  (.set bio … juga jalan untuk owner)
.set group chat <admin|all>       .set group edit <admin|all>
.set group add <admin|all>        .set group approval <on|off>
.set group ephemeral <off|24h|7d|90d>

.on / .off                        → daftar fitur + status
.on welcome | goodbye | adminnotif | antilink | delete   → fitur grup (admin grup)
                                  (adminnotif = notif promote & demote)
.on autoai                        → AutoAI di grup ini (khusus owner)
.on bot                           → bot aktif/mati di satu grup (owner)
.on owner selfmode | autoai | autoread | limitnotice | anticall | statusreact | cmdsuggest | levelup   → fitur bot (owner)
```

Pengaturan `.on owner …` tersimpan di `database/settings.json` dan dipakai lagi setelah restart.

### AutoAI (Tsukiyuki Miyako)

Balasan otomatis tanpa command, dengan karakter Miyako (Blue Archive); **owner dipanggil "Sensei"**.
- Chat pribadi: `.on owner autoai` (membalas semua teks).
- Grup: `.on autoai` di grup itu (khusus owner). Bot membalas bila di-mention, pesannya di-reply, atau namanya ("Miyako") disebut.
- Ganti karakter: `.set owner persona <teks>` (`reset` untuk kembali ke Miyako). Ganti AI: `.set owner aimodel <nama>`.
- Ada jeda 5 detik per pengguna (owner bebas) dan ingatan 6 pesan terakhir per chat (`.resetai` untuk menghapus).
- **Membaca gambar & video**: kirim / reply gambar atau video ke Miyako (di grup sebutkan namanya di caption). Video dibaca lewat satu cuplikan frame (butuh ffmpeg).
- **Semua perintah di `.menu` bisa dipicu lewat obrolan** (AutoAI harus aktif di chat itu; hak akses & limit sama persis seperti mengetik command). Urutannya: (1) aturan kalimat — "tutup grup ini", "putar lagu …", link TikTok / YouTube / Spotify / dll → pengunduh yang cocok, gambar + "hapus background" → `.removebg`, gambar / video + "jadikan stiker" → `.s`, gambar / video / audio + "jadikan link" → `.tourl`, "stalk github …", "lirik …", "gambarkan …", "menu", "level saya", dst; (2) bila terdengar seperti permintaan tapi tak ada aturan yang cocok, **router AI** memilih satu perintah dari seluruh katalog yang boleh dipakai pengirim; (3) selain itu Miyako mengobrol. Perintah berbahaya (`eval exec restart addplugin delplugin getplugin addowner delowner`) tidak pernah bisa dipicu. Audio / voice note dikenali sebagai lampiran (bisa dijadikan link / status grup lewat kalimat), tetapi **isinya belum bisa didengarkan** — tidak ada API transkripsi.
- **Perintah grup / owner lewat obrolan** (khusus yang berhak): Kalimat yang jelas dikenali langsung tanpa menunggu AI (`lib/intents.js`: "tutup grup ini", "bukain gc", "tag semua …", "keluarkan @user", "jadikan admin @user", "nyalakan welcome", "ganti nama grup jadi …", "list owner", "beri premium 30 hari" …); selain itu AI yang memilih lewat penanda `[[CMD: …]]`. Kalimat berisi larangan ("jangan tutup grup") atau pertanyaan ("kenapa grup ditutup?") diabaikan. *"Miyako, tutup grup ini"* → `.close`. Admin grup dan owner bisa memicu perintah grup (`open close tagall hidetag linkgc revoke infogc listadmin kick promote demote add on off set`); **hanya owner** yang bisa memicu perintah owner (`listowner listprem addprem delprem ban unban listplugin join leave`). Hak akses dicek ulang seperti command biasa (admin / bot-admin), target `kick/promote/demote` harus dari mention atau reply asli, dan `eval exec restart addplugin delplugin addowner delowner` **tidak pernah** bisa dipicu lewat AutoAI. Anggota biasa tidak mendapat tindakan apa pun.

### Pesan limit

Setiap command berlimit yang berhasil dijalankan — termasuk lewat AutoAI dan tombol list `.play` — diikuti pesan singkat, mis. `🎟️ Limit terpakai 1 • sisa 24/25`, dengan peringatan bila sisa ≤ 3 atau habis. Command yang gagal mengembalikan limitnya dan tidak memunculkan pesan. Premium dan owner tidak dipotong. Matikan pesannya dengan `.off owner limitnotice` (limit tetap terpotong).

### AI membaca gambar & video

Semua command AI (`.gemini .gpt .claude .deepseek …`) menerima gambar / video: kirim atau reply media dengan command-nya (teks boleh kosong → "jelaskan isi gambar"). Gambar diunggah ke `cdn.zavedya.id` lalu dikirim ke API sebagai `imageUrl`; video diambil satu frame-nya dulu. Bila model pilihan tidak bisa membaca gambar (error atau menjawab `[TANPA_GAMBAR]`), bot otomatis mencoba model lain (`gemini → gpt → claude → qwen → kimi`, maks 3 percobaan) dan memberi catatan di akhir jawaban. Ubah urutan / nama parameter di `lib/vision.js` (`VISION_CHAIN`, `VISION_PARAM`). Uji manual: `.curl "https://api.zavedya.id/v1/ai/gemini?prompt=apa&imageUrl=https://…"`.

### Kartu gambar (welcome • goodbye • level-up)

Notifikasi anggota masuk / keluar dan level-up tampil sebagai **link preview besar** berisi kartu bergambar (foto profil, nama, nama grup, jumlah anggota; level-up memakai bar progres EXP). Kartu dirender dengan ffmpeg (`drawtext` + `overlay`) memakai font Poppins — tanpa library tambahan. Bila render gagal, bot jatuh kembali ke foto profil + teks atau teks saja.
- Aset: `config/cards/*-bg.png` (latar tanpa teks), `config/fonts/` (Poppins, lisensi OFL). Tata letak ada di `lib/cards.js`.
- Banner konsol: ganti gambar maskot lewat `python3 tools/make-banner-art.py gambar.png` (menulis ulang `lib/banner-art.js`). `BANNER_ASCII=1` memakai huruf biasa tanpa karakter braille; `BANNER_SIZE=large|small|tiny|none` memaksa ukuran. Konsol panel / pipe (lebar tak diketahui, mis. Pterodactyl di HP) otomatis memakai ukuran kecil.
- Ganti desain: siapkan 3 template baru (teks contoh seperti di template aslinya), sesuaikan koordinat di `tools/build-card-assets.py` dan `lib/cards.js`, lalu jalankan `python3 tools/build-card-assets.py welcome.png goodbye.png levelup.png` (butuh `opencv-python numpy pillow fonttools`).
- Nama pengguna / grup yang memakai "font" Unicode (𝑀𝑖𝑦𝑎𝑘𝑜, ｍｉｙａｋｏ, ⓜⓘⓨⓐ, ᴍɪʏᴀᴋᴏ) dinormalkan ke huruf biasa; emoji dan aksara yang tidak ada di font dibuang, tanda kurung yang jadi kosong dirapikan. Bila tak ada huruf tersisa, nama diganti nomor (grup: "Grup").
- Tanpa foto profil (atau fotonya disembunyikan): kotak / lingkaran berwarna dengan huruf awal nama.
- Tiap kartu memakai URL preview unik (`?card=…`) karena WhatsApp menyimpan thumbnail berdasarkan URL — tanpa itu kartu pertama muncul terus pada kartu berikutnya.
- Kartu **level-up** menampilkan level lama → baru dengan bar penuh. Untuk melihat progres EXP yang terus bertambah gunakan `.level` (kiri = level sekarang, kanan = level berikutnya, bar = EXP menuju level berikutnya).

### Notifikasi grup

`.on welcome` (anggota masuk, dengan foto profil bila ada), `.on goodbye` (keluar / dikeluarkan), `.on adminnotif` (promote / demote).
Teks kustom: `.set group welcome …` dan `.set group goodbye …`. Notifikasi buka/tutup grup muncul sekali saja (balasan command-nya).

### `.get` / `.post` (HTTP ke website)

Premium & owner. `.get <url> [k=v …]` otomatis mengenali **JSON** (dirapikan; panjang → file), **gambar**, **video**, **audio**, HTML (ringkasan), dan file lain (dikirim sebagai dokumen).
`.post|.put|.patch <url> <body>` (JSON, `k=v k2=v2`, atau teks), `.delete`, `.head`. Opsi: `-H "Nama: nilai"`, `-f` (paksa file), `-t` (paksa teks), `-i` (tampilkan header).
Aman: hanya alamat publik (localhost, jaringan privat, dan metadata cloud diblokir, termasuk lewat redirect), maks 50 MB, timeout 30 detik.

### `.curl`

Tempel perintah curl apa adanya (awalan `curl` boleh dihilangkan), contoh: `.curl -X POST https://httpbin.org/post -H "Content-Type: application/json" -d '{"a":1}'`. Didukung: `-X -H -d/--data-raw/--data-urlencode --json -F -u -A -e -b -G -I -i -m -o`; opsi seperti `-L -s -k --compressed` diabaikan; `@file` dan proxy tidak didukung. Respons ditampilkan seperti `.get` (JSON dirapikan, gambar / video / audio dikirim sebagai media). Aturan keamanan sama dengan `.get` (alamat publik saja, maks 50 MB). Premium & owner.

### Autoread

`.on owner autoread` menandai semua pesan masuk (grup + pribadi) sebagai sudah dibaca. Batasi dengan `.set owner autoread group|private|all|off`. Pesan sendiri, status, dan channel dilewati.

### Diagnosa kartu

`.cardtest welcome|goodbye|levelup` (owner) merender kartu dengan datamu sendiri dan menampilkan alasan lengkap bila gagal (ffmpeg / filter `drawtext` / aset / pengiriman). Bot juga mencatat peringatan saat start bila ffmpeg tidak punya `drawtext`. Bila link preview besar tidak tampil di WhatsApp-mu: `.set owner cardstyle image` (kartu dikirim sebagai gambar biasa).

### Status grup (`.swgc`)

Admin grup dan owner bisa memposting **status grup** lewat opsi `groupStatus` @zavedyaid/baileys:
`.swgc <teks>`, atau kirim / reply gambar, video, atau audio dengan `.swgc [caption]`. Audio dikirim **utuh (tanpa batas 60 detik)** sebagai *voice note* (OGG/Opus) — file audio biasa seperti mp3 ditolak WhatsApp sebagai status dan memunculkan pesan "update WhatsApp". Media status grup (gambar / video / voice note) dikirim lewat relay manual (`lib/groupstatus.js`) supaya jenis medianya terdeteksi benar oleh Baileys; teks tetap lewat `groupStatus`. Opsi: `-s` = jalur lama, `-v` = audio dibungkus video (maks 60 detik) bila WhatsApp-mu tetap menolak voice note.

> ⚠️ `.eval`, `.exec`, dan `.addplugin` memberi kendali penuh atas server. Hanya jadikan owner (di `ownerNumbers` maupun lewat `.addowner`) orang yang benar-benar kamu percaya.

---

## 📝 Registrasi Pengguna

```text
.register   → "Nama siapa?" → "Umur berapa?" → "Gender?" (Male/Female atau Laki²/Perempuan)
```

- Pesan **Register Di Proses** diedit menjadi **Sedang Menyiapkan**, lalu **Register Selesai** dan **kartu register** (gambar) dikirim berisi foto profil, nama, umur, gender, nomor WhatsApp, **SN** (mis. `9166-88F9-A3E9`), **No. Kartu** urut, tanggal daftar, level, dan status.
- Pendaftar baru mendapat **hadiah registrasi** RPG (gold, Potion HP, Peti Kayu).
- Jawab `batal` untuk membatalkan. `.kartu [@tag]` menampilkan kartu lagi, `.unreg ya` menghapus pendaftaran. `.profil` pengguna terdaftar tampil sebagai kartu.
- Data: `database/users.json` → `reg = { on, name, age, gender, sn, no, at }`. Matikan kewajiban register lewat `features.registerRequired: false`.

---

## ⚔️ Game RPG

Semua data pemain ada di `users.json` → `rpg`. Aturan, item, monster, harga, dan hadiah ada di **`lib/rpg.js`** (ubah bebas); tampilan di `lib/rpgui.js`; perintah di `plugins/rpg/`.

| Kelompok | Command |
| :--- | :--- |
| Petualangan | `.berburu` (10 stamina) · `.dungeon` (30 stamina, Lv 5+, 3 musuh + boss) · `.nambang` (8) · `.mancing` (6) |
| Hadiah | `.daily` (streak, peti tiap 7 hari) · `.weekly` (gold + berlian + peti emas) · `.peti <id> [n]` |
| Tas & perlengkapan | `.inv [hal]` · `.pakai <ramuan>` · `.equip <id>` · `.unequip` |
| Ekonomi | `.toko` · `.buy` / `.beli <id> [n]` · `.sell` / `.jual <id> [n\|all]` (struk bergambar) · `.tempa [id]` |
| Bank (ATM) | `.buy atm` (beli Kartu ATM dulu) → `.setpin <4-6 angka>` (chat pribadi) → `.atm <Nomor Serial> <PIN>` (SN ada di `.profil` / `.kartu`) → Success, ATM terbuka 10 menit untuk `.deposit <n\|all>` · `.tarik <n\|all>` · `.transfer @tag <n>` — jumlah boleh `2k` / `1.5m`; salah PIN 5× = terkunci 10 menit |
| Driver | `.ojol` (8 stamina, jeda 2 mnt) · `.gofood` (10, Lv 2+, 3 mnt) · `.gocar` (14, Lv 3+, 4 mnt) |
| Sosial | `.kerja` (20 mnt) · `.misi` / `.misi claim` |
| Lawan pemain (tag) | `.duel @tag [taruhan]` (5 mnt) · `.balap @tag [taruhan]` (5 mnt) · `.rampok @tag` (1 jam) · `.suitpvp @tag [taruhan]` |
| Peringkat | `.leaderboard [kategori]` — `petualang` (default) · `uang` · `gold` · `bank` · `berlian` · `limit` · `level` · `kill` · `dungeon` · `orderan` · `duel` · `suit` · `balap` |
| Status | `.rpg [@tag]` (kartu hero) · `.rpg help` |

- **Stamina** pulih 1 per 45 detik, **HP** pulih 1 per 20 detik (dihitung otomatis). Naik level → HP pulih penuh + bonus gold.
- Senjata/zirah menambah ATK/DEF; monster dan boss makin kuat seiring level; boss naga menjatuhkan Sisik Naga untuk perlengkapan terkuat.
- **ATM**: gold di bank aman dari `.rampok`, berbunga **1%/hari** (maks 5.000, tertumpuk sampai 7 hari), limit bank naik 10.000 tiap level. Nomor kartu bank 16 digit tetap per pemain. Transfer antar-pemain kena biaya 2%.
- **Misi harian**: kalahkan 5 monster, menambang 3x, memancing 3x → hadiah 500 Gold + 1 Berlian + Peti Kayu.
- **Driver (ojol / gocar / gofood)**: tiap pesanan dapat rating 1–5 bintang yang mengatur bayaran, kadang tip, berlian, dan item (GoFood → ramuan, GoCar → peti, Ojol → minuman energi); 5x bintang 5 berturut-turut = bonus 300 Gold, tiap 10 pesanan dapat Peti Kayu, tiap 50 pesanan Peti Emas + 3 Berlian. Pesanan bisa batal atau kena macet/hujan.
- **Suit PvP**: `.suitpvp @lawan [taruhan]` → lawan jawab di grup (`y`/`gas`/`yes`/`oke` terima, `n`/`gak`/`no`/`gamau` tolak) → bot kirim pilihan batu/gunting/kertas ke **chat pribadi** masing-masing → setelah keduanya memilih ada hitung mundur → "Congratulations......" + kartu hasil. Seri diulang sampai 3 ronde. Pemenang dapat taruhan + bonus gold + XP. `.suitpvp batal` membatalkan. Status permainan ada di `lib/suit.js` (di memori).
- **Leaderboard**: papan peringkat berupa kartu bergambar, Top 10 per kategori plus peringkat pemanggil.
- **Hanya di grup**: semua perintah RPG khusus grup. Pengecualian: `.setpin` dan pilihan suit lewat chat pribadi (supaya rahasia).
- Perintah RPG tidak memotong limit harian.

---

## 🎴 Kartu Gambar

Semua kartu dirender `lib/cards.js` (ffmpeg + Poppins) di atas latar `config/cards/*-bg.png`. Latar dibuat dengan skrip Python (sekali jalan, bukan oleh bot; butuh `pillow`):

| Skrip | Menghasilkan |
| :--- | :--- |
| `python3 tools/build-register-bg.py [gambar]` | `register-bg.png` |
| `python3 tools/build-card-bgs.py [gambar]` | `welcome-bg.png`, `goodbye-bg.png`, `levelup-bg.png` |
| `python3 tools/build-rpg-assets.py [gambar]` | `profile-bg.png`, `hero-bg.png`, `grid-bg.png`, `result-bg.png`, `atm-bg.png` + ikon item `config/cards/rpg/*.png` |

Ganti gambar karakter dengan menjalankan skrip memakai gambar lain (bawaan: `config/cards/register-source.jpg`). Posisi teks tiap kartu ada di `LAYOUT` dalam `lib/cards.js`. Uji kartu welcome/goodbye/levelup dengan `.cardtest`.

---

## 🎚️ Sistem Limit, Level & EXP

- Tiap pengguna mendapat **limit** awal dari `limit.default`. Command dengan `limit: N` memotong N limit; **premium dan owner tidak dipotong**. Limit dikembalikan bila command gagal.
- Setiap pesan dan pemakaian command menambah **EXP**. Saat EXP cukup, pengguna naik **level** dan bot mengirim notifikasi 🎉 LEVEL UP (matikan lewat `features.levelUpNotif`).
- Data pengguna disimpan sebagai JSON di folder `database/`.

---

## 👥 Kredit & Lisensi

- **ZavedyaID** — Developer & pemilik project  
  [Website](https://zavedya.id) • [GitHub](https://github.com/ZavedyaID)
- **RullzFuqi** — Base Dari Bot Ini [GitHub](https://github.com/RullzFuqi)
- **[zavedyaid/baileys](https://github.com/ZavedyaID/baileys)** — Sebagai connecting semuanya.
- **ZavedyaApi's** — Penyedia Api. [Website](https://api.zavedya.id)
- Rantai kredit Baileys (sesuai README `@zavedyaid/baileys`): **WhiskeySockets/Baileys** (library asli), **Lia Wynn (itsliaaa)** (enhanced fork), serta purpshell, jlucaso1, adiwajshing, dan WPP Connect (wa-proto). Ketik `.tqto` di bot untuk ucapan terima kasih lengkap.
- Font kartu: **Poppins** © The Poppins Project Authors, lisensi [SIL OFL 1.1](https://openfontlicense.org) (`config/fonts/`).

Project ini dilisensikan di bawah [MIT License (Modified)](./LICENSE) © ZavedyaID — **tidak boleh dijual atau dipakai untuk tujuan komersial tanpa izin tertulis dari pemegang hak cipta.**
