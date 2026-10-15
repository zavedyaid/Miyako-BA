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
