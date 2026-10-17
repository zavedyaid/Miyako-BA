/*
 * Pendeteksi perintah dari kalimat biasa (bahasa Indonesia) untuk AutoAI — deterministik, tanpa menunggu AI.
 *   detectIntent("Miyako, tutup grup ini", { actions, hasTarget, inGroup }) → { command: "close", args: "" }
 * Hanya mengembalikan tindakan yang ADA di `actions` (yang boleh dilakukan pengirimnya).
 * Kalimat yang berisi larangan ("jangan tutup grup") atau pertanyaan ("kenapa grup ditutup?") diabaikan.
 */
const GC = "(?:grup|group|gc)";
const NEGATION = /\b(?:jangan|jgn|gausah|gak usah|ga usah|nggak usah|enggak usah|tidak usah|kenapa|mengapa|knp|apakah|kapan)\b/;
const GROUP_FEATURES = "(welcome|goodbye|adminnotif|admin notif|antilink|anti link|antidelete|anti delete|delete)";
const OWNER_FEATURES = "(autoai|autoread|statusreact|selfmode|anticall|cmdsuggest)";
const FEATURE_NAME = { "admin notif": "adminnotif", "anti link": "antilink", "anti delete": "delete", antidelete: "delete" };

const tidy = (s) =>
  String(s ?? "")
    .replace(/@\d{5,}/g, " ")
    .replace(/^[\s:,;-]*(?:dengan|bilang|tulis|pesan(?:nya)?|isi(?:nya)?|yaitu)?[\s:,;-]*/i, "")
    .replace(/\s+/g, " ")
    .trim();

// [perintah, regex, opsi]  — urutan penting: yang lebih spesifik lebih dulu.
const RULES = [
  ["close", new RegExp(`\\b(?:tutup(?:in|kan)?|close|kunci)\\s+(?:semua\\s+)?${GC}\\b|\\b${GC}(?:nya)?\\s+(?:di)?(?:tutup|close|kunci)\\b`)],
  ["open", new RegExp(`\\b(?:buka(?:in|kan)?|open)\\s+${GC}\\b|\\b${GC}(?:nya)?\\s+(?:di)?(?:buka|open)\\b`)],
  ["revoke", /\b(?:reset|revoke|perbarui|buat ulang|ganti)\s+(?:link|tautan)\b/],
  ["linkgc", new RegExp(`\\b(?:link|tautan|url)\\s*(?:undangan\\s*)?${GC}\\b|\\b(?:minta|kasih|mana)\\s+(?:link|tautan)\\b`)],
  ["infogc", new RegExp(`\\b(?:info|informasi|detail)\\s*(?:lengkap\\s*)?${GC}\\b`)],
  ["listadmin", /\b(?:daftar|list|siapa(?:\s+saja)?)\s*(?:para\s*)?admin\b/],
  ["tagall", /\b(?:tag\s?all|tagall|tag semua|mention semua|panggil semua|tag everyone)\b/, { rest: true }],
  ["hidetag", /\b(?:hide\s?tag|hidetag|tag diam(?:-diam)?|tag sembunyi)\b/, { rest: true }],
  ["swgc", new RegExp(`\\b(?:swgc|status\\s+${GC})\\b`), { rest: true }],
  ["promote", /\b(?:promote|jadikan admin|jadiin admin|angkat(?: jadi)? admin|kasih admin)\b/, { target: true }],
  ["demote", /\b(?:demote|turunkan(?: dari)? admin|copot(?: dari)? admin|cabut(?: jabatan)? admin|unadmin)\b/, { target: true }],
  ["kick", /\b(?:kick|keluarkan|tendang|usir|dor|remove)\b/, { target: true }],
  ["add", /\b(?:tambah(?:kan|in)?|add|invite|masukkan|masukin)\b/, { number: true }],
  ["leave", new RegExp(`\\b(?:keluar|leave|pergi|cabut)\\s+(?:dari\\s+)?${GC}\\b`)],
  ["listowner", /\b(?:daftar|list)\s*owner\b/],
  ["listprem", /\b(?:daftar|list)\s*(?:user\s*|pengguna\s*)?premium\b/],
  ["delprem", /\b(?:cabut|hapus|del|hilangkan)\s+(?:akses\s+)?premium\b/, { target: true }],
  ["addprem", /\b(?:tambah(?:kan)?|beri(?:kan)?|kasih|add)\s+(?:akses\s+)?premium\b/, { target: true, days: true }],
  ["unban", /\b(?:unban|buka blokir|bebaskan)\b/, { target: true }],
  ["ban", /\b(?:ban|blokir)\b/, { target: true }],
  ["tqto", /\b(?:tqto|thanks ?to|kredit|credits)\b/],
];

export const detectIntent = (text, { actions = {}, hasTarget = false, inGroup = false } = {}) => {
  const original = String(text ?? "");
  const lower = original.toLowerCase();
  if (!lower.trim() || NEGATION.test(lower)) return null;

  // join: butuh link undangan
  const invite = original.match(/chat\.whatsapp\.com\/[A-Za-z0-9]{10,}/i);
  if (invite && actions.join && /\b(?:join|masuk|gabung|ikut)\b/.test(lower)) return { command: "join", args: `https://${invite[0]}` };

  // on / off fitur
  const toggle = lower.match(new RegExp(`\\b(nyalakan|nyalain|aktifkan|aktifin|hidupkan|hidupin|enable|matikan|matiin|nonaktifkan|disable)\\s+(?:fitur\\s+)?(?:${GROUP_FEATURES}|${OWNER_FEATURES})\\b`));
  if (toggle) {
    const command = /^(?:nyalakan|nyalain|aktifkan|aktifin|hidupkan|hidupin|enable)$/.test(toggle[1]) ? "on" : "off";
    const groupFeature = toggle[2];
    const ownerFeature = toggle[3];
    if (groupFeature && actions[command]) return { command, args: FEATURE_NAME[groupFeature] ?? groupFeature };
    if (ownerFeature && actions[command]) return { command, args: ownerFeature === "autoai" && inGroup ? "autoai" : `owner ${ownerFeature}` };
  }

  // set nama / deskripsi grup
  const rename = original.match(new RegExp(`\\b(?:ganti|ubah|set|rename)\\s+nama\\s+${GC}(?:\\s+(?:jadi|menjadi|ke|:))?\\s+(.+)$`, "i"));
  if (rename && actions.set) return { command: "set", args: `group name ${tidy(rename[1])}` };
  const desc = original.match(new RegExp(`\\b(?:ganti|ubah|set)\\s+(?:deskripsi|desc)\\s+(?:${GC}\\s+)?(?:(?:jadi|menjadi|ke|:)\\s+)?(.+)$`, "i"));
  if (desc && actions.set) return { command: "set", args: `group desc ${tidy(desc[1])}` };

  // mode bot
  const mode = lower.match(/\b(?:ubah|ganti|set|jadikan)\s+mode(?:\s+bot)?\s+(?:jadi\s+|ke\s+)?(self|public)\b/);
  if (mode && actions.setmode) return { command: "setmode", args: mode[1] };

  for (const [command, re, opts = {}] of RULES) {
    if (!actions[command]) continue;
    const hit = lower.match(re);
    if (!hit) continue;
    if (opts.target && !hasTarget && !/\d{8,}/.test(lower)) continue;

    let args = "";
    if (opts.rest) args = tidy(original.slice(hit.index + hit[0].length));
    if (opts.number) {
      const number = original.match(/\+?\d[\d\s-]{7,}\d/);
      if (!number) continue;
      args = number[0].replace(/[^\d]/g, "");
    }
    if (opts.target) args = (lower.match(/\d{8,}/)?.[0] ?? "");
    if (opts.days) {
      const days = lower.match(/(\d{1,4})\s*(?:hari|hr|day)/);
      args = [args, /\b(?:permanen|selamanya|perm)\b/.test(lower) ? "perm" : days?.[1]].filter(Boolean).join(" ");
    }
    return { command, args };
  }
  return null;
};

/*
 * Perintah umum (di luar perintah grup / owner): unduh link, putar lagu, hapus background, stiker, stalk, dll.
 *   detectGeneralIntent("putar lagu jomblo happy", { has, allowed }) → { command: "play", args: "jomblo happy" }
 * `has`     : jenis lampiran { image, video, audio } (dari pesan ini atau pesan yang di-reply)
 * `allowed` : Set nama command yang boleh dipakai pengirim ini — hasil di luar itu dibuang.
 */
const URL_RE = /https?:\/\/[^\s<>"']+/i;
const hostIn = (host, ...names) => names.some((n) => host === n || host.endsWith(`.${n}`));

const urlRoute = (url, lower) => {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  if (hostIn(host, "tiktok.com")) return "tiktok";
  if (hostIn(host, "youtube.com", "youtu.be")) return /\b(?:audio|mp3|lagu|musik|suara)\b/.test(lower) ? "ytmp3" : "ytmp4";
  if (hostIn(host, "spotify.com")) return "spotify";
  if (hostIn(host, "soundcloud.com")) return "soundcloud";
  if (hostIn(host, "pinterest.com", "pin.it")) return "pindl";
  if (hostIn(host, "mediafire.com")) return "mediafire";
  if (hostIn(host, "terabox.com", "1024terabox.com", "teraboxapp.com", "terabox.app")) return "terabox";
  if (hostIn(host, "likee.video", "likee.com")) return "likee";
  if (hostIn(host, "xiaohongshu.com", "xhslink.com")) return "rednote";
  if (hostIn(host, "dailymotion.com", "dai.ly")) return "dailymotion";
  if (hostIn(host, "whatsapp.com") && /\/channel\//.test(url)) return "cekidch";
  return null;
};

const STALK = { github: "githubstalk", instagram: "instagramstalk", ig: "instagramstalk", tiktok: "tiktokstalk", twitter: "twitterstalk", x: "twitterstalk", youtube: "youtubestalk", yt: "youtubestalk" };

// Nama kategori menu yang boleh disebut dalam kalimat → kategori asli di registry.
const CATEGORY_ALIAS = {
  ai: "ai", downloader: "downloader", download: "downloader", unduh: "downloader", pengunduh: "downloader",
  search: "search", pencarian: "search", group: "group", grup: "group", gc: "group",
  tools: "tools", tool: "tools", alat: "tools", stalker: "stalker", stalk: "stalker", maker: "maker", wiki: "wiki",
  owner: "owner", general: "general", umum: "general", all: "all", semua: "all", lengkap: "all",
};
const MENU_FILLER = new Set(["dong", "donk", "ya", "yah", "yaa", "aja", "saja", "please", "pls", "nya", "deh", "sih"]);
// "menu", "tampilkan menu ai", "daftar fitur downloader dong" — HARUS kalimat pendek yang memang meminta menu (bukan sekadar memuat kata "menu").
const MENU_RE = /^(?:(?:tolong|coba|bisa|mau)\s+)?(?:(?:tampilkan|tampilin|munculkan|munculin|lihat(?:kan)?|liat(?:in)?|kasih(?:in)?|kasih tau|buka(?:in)?|show|list|berikan|beri|minta|mana)\s+)?(?:semua\s+)?(?:daftar\s+)?(?:menu|perintah|fitur|command|help|bantuan)(?:\s+(?:bot|kamu|mu))?(?:\s+(?:fitur\s+|kategori\s+|category\s+)?([a-z]+))?(?:\s+(?:dong|donk|ya|yah|yaa|aja|saja|please|pls|nya|deh|sih))*$/;

export const detectMenuIntent = (text, categories = new Set()) => {
  const clean = String(text ?? "")
    .toLowerCase()
    .replace(/@\d{5,}/g, " ")
    .replace(/\b(?:tsukiyuki\s+)?miyako\b|\btsukiyuki\b/g, " ")
    .replace(/[,.!?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const hit = clean.match(MENU_RE);
  if (!hit) return null;
  const word = hit[1] && !MENU_FILLER.has(hit[1]) ? hit[1] : "";
  if (!word) return { args: "" };
  const category = CATEGORY_ALIAS[word] ?? word;
  if (category === "all" || categories.has(category)) return { args: category };
  return null; // "menu makan siang" dsb. bukan permintaan menu bot
};

export const detectGeneralIntent = (text, { has = {}, allowed = new Set(), categories = new Set() } = {}) => {
  const original = String(text ?? "").trim();
  const lower = original.toLowerCase();
  const pick = (command, args = "") => (allowed.has(command) ? { command, args: String(args).trim() } : null);
  if (!lower) return null;
  if (NEGATION.test(lower)) return null;

  // Lampiran + perintah singkat
  if (has.image) {
    if (/\b(?:hapus|hilangkan|buang|remove)\s+(?:the\s+)?(?:background|bg|latar)\b|\bremove\s?bg\b|\bhapus\s?bg\b/.test(lower)) return pick("removebg");
    if (/\b(?:stiker|sticker)\b/.test(lower)) return pick("s");
  }
  if (has.video && /\b(?:stiker|sticker)\b/.test(lower)) return pick("s");
  if ((has.image || has.video || has.audio) && /\b(?:tourl|to url|upload|jadikan\s+(?:link|url)|buat(?:kan)?\s+(?:link|url)|jadiin\s+(?:link|url))\b/.test(lower)) return pick("tourl");

  // Link → pengunduh yang cocok
  const url = original.match(URL_RE)?.[0];
  if (url) {
    const route = urlRoute(url, lower);
    if (route) return pick(route, url);
    if (/\b(?:upload|jadikan\s+(?:link|url))\b/.test(lower) === false && /\b(?:curl|get|fetch|buka|ambil)\b/.test(lower)) return pick("get", url);
  }

  // Teks
  let m;
  if ((m = original.match(/\b(?:putar(?:kan|in)?|puter(?:in)?|setel(?:kan)?|carikan|cari)\s+(?:lagu|musik|lagunya)\s+(.+)/i))) return pick("play", m[1]);
  if ((m = original.match(/^\s*play\s+(.+)/i))) return pick("play", m[1]);
  const core = original.replace(/@\d{5,}/g, " ").replace(/\b(?:tsukiyuki\s+)?miyako\b|\btsukiyuki\b/gi, " ").replace(/^[\s,:;!.-]+/, "");
  if ((m = core.match(/^(?:(?:tolong|coba)\s+)?(?:(?:cari(?:kan|in)?|minta|kasih(?:in)?|tampilkan|lihat(?:kan)?)\s+)?lirik\s+(?:lagu\s+)?(.{2,})/i))) return pick("lirik", m[1]);
  if ((m = original.match(/\b(?:gambarkan|buatkan\s+gambar|bikin(?:in)?\s+gambar|generate\s+gambar|buat\s+gambar)\s+(.+)/i))) return pick("flux", m[1]);
  if ((m = original.match(/\bcari\s+(?:video\s+)?(?:di\s+)?youtube\s+(.+)/i))) return pick("yts", m[1]);
  if ((m = original.match(/\bcari\s+(?:gambar|foto)\s+(?:di\s+)?pinterest\s+(.+)/i))) return pick("pinterest", m[1]);
  if ((m = lower.match(/\b(?:stalk|stalking|info|cek)\s+(github|instagram|ig|tiktok|twitter|x|youtube|yt)\s+@?(\S+)/))) return pick(STALK[m[1]], m[2]);
  if (/\b(?:email|surel)\s+(?:sementara|temp)\b|\btemp\s?mail\b/.test(lower)) return pick("tempmail");
  const menu = detectMenuIntent(original, categories);
  if (menu) return pick("menu", menu.args);
  if (/^\W*(?:ping|tes bot|test bot)\W*$/.test(lower)) return pick("ping");
  if (/\b(?:profil|profile)\s+(?:saya|ku|aku|gue|gw)\b/.test(lower)) return pick("profil");
  if (/\b(?:level|exp|rank)\s+(?:saya|ku|aku|gue|gw)\b|\bcek\s+level\b/.test(lower)) return pick("level");
  if (/\b(?:siapa|kontak|nomor)\s+(?:owner|pemilik)\b/.test(lower)) return pick("owner");
  if (/\b(?:lupakan|reset)\s+(?:obrolan|percakapan|chat|ingatan)\b/.test(lower)) return pick("resetai");

  // Edit gambar lewat AI: "ubah gambar ini jadi anime"
  // Hanya bila jelas meminta mengubah gambarnya ("ubah jadi anime", "ganti background-nya ..."), bukan sekadar ada kata "buat".
  if (
    has.image &&
    !original.includes("?") &&
    /\b(?:edit|ubah|ganti|jadikan|bikin(?:in)?|buat(?:kan)?)\b.{0,50}\b(?:jadi|menjadi|gaya|style|warna|background|latar|rambut|baju|pakaian)\b/i.test(original) &&
    !/\b(?:stiker|sticker|link|url)\b/i.test(original)
  ) {
    return pick("nanobanana", original);
  }
  return null;
};

// Apakah pesan ini "terdengar seperti permintaan"? Dipakai untuk memutuskan perlu memanggil router AI atau cukup mengobrol.
// Sengaja sempit: kata ambigu seperti "bisa / mau / coba / tolong / cek / kasih" TIDAK memicu router (itu obrolan biasa).
const REQUEST_WORDS = /\b(?:buat(?:kan)?|bikin(?:in)?|cari(?:kan)?|putar(?:kan|in)?|puter(?:in)?|download|unduh|unggah|upload|kirim(?:kan)?|ubah|jadikan|jadiin|tampilkan|tampilin|hapus|hilangkan|tambah(?:kan)?|convert|konversi|terjemah(?:kan)?|translate|stiker|sticker|aktifkan|matikan|nyalakan)\b/;
const QUESTION_START = /^\W*(?:apa|apakah|siapa|kenapa|mengapa|gimana|bagaimana|kapan|dimana|di mana|berapa|mana)\b/;
export const looksLikeRequest = (text, { hasMedia = false } = {}) => {
  const t = String(text ?? "").toLowerCase().trim();
  if (!t) return false;
  if (URL_RE.test(t)) return true;
  if (QUESTION_START.test(t)) return false;
  if (REQUEST_WORDS.test(t)) return t.length <= 160;
  return hasMedia && t.length <= 40 && !t.includes("?");
};
