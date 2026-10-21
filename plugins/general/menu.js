import { definePlugin } from "#lib/plugins";
import { t } from "#lib/i18n";
import { sendInteractive } from "#lib/interactive";
import { rankLabel } from "#lib/levels";
import { clockTime, greeting, smallCaps as sc, uptime } from "#lib/utils";
import { tr } from "#lib/tr";

// Baris kategori ditulis sama seperti baris lain: "emoji - Nama".
const CATEGORY_LOOK = {
  ai: ["🤖", "AI"],
  downloader: ["📥", "Downloader"],
  game: ["🎮", "Game"],
  general: ["🏠", "General"],
  group: ["👥", "Group"],
  maker: ["🎨", "Maker"],
  owner: ["👑", "Owner"],
  rpg: ["⚔️", "RPG"],
  search: ["🔍", "Search"],
  stalker: ["🕵️", "Stalker"],
  tools: ["🛠️", "Tools"],
  wiki: ["📚", "Wiki"],
};
// Deskripsi singkat tiap kategori (tampil di bawah judul baris pada pilihan select).
const CATEGORY_DESC = {
  ai: () => tr("Chat & gambar AI: GPT, Gemini, Claude, DeepSeek, dll", "AI chat & images: GPT, Gemini, Claude, DeepSeek & more"),
  downloader: () => tr("Unduh video & musik: TikTok, YouTube, Spotify, dll", "Download video & music: TikTok, YouTube, Spotify & more"),
  game: () => tr("Catur, 2048, Dino, Abyss + redeem hadiah", "Chess, 2048, Dino, Abyss + redeem rewards"),
  general: () => tr("Profil, level, register, ping & info bot", "Profile, level, register, ping & bot info"),
  group: () => tr("Kelola grup: tagall, kick, welcome, anti-spam", "Group tools: tagall, kick, welcome, anti-spam"),
  maker: () => tr("Buat stiker, meme & kutipan chat", "Make stickers, memes & quote chats"),
  owner: () => tr("Kontrol owner: premium, redeem, cheat, backup", "Owner controls: premium, redeem, cheat, backup"),
  rpg: () => tr("Berburu, dungeon, bank, toko, give & leaderboard", "Hunt, dungeons, bank, shop, give & leaderboard"),
  search: () => tr("Cari lagu, berita, gambar & lirik", "Search songs, news, images & lyrics"),
  stalker: () => tr("Cek profil Instagram, TikTok, GitHub, dll", "Look up Instagram, TikTok, GitHub profiles & more"),
  tools: () => tr("Converter, upload, HTTP, remove bg & lainnya", "Converter, upload, HTTP, remove bg & more"),
  wiki: () => tr("Info karakter game: Wuthering Waves, HoK", "Game wikis: Wuthering Waves, Honor of Kings"),
};
const FALLBACK_POPULAR = ["ai", "downloader", "game"];

const categoryTitle = (cat) => {
  const [icon, name] = CATEGORY_LOOK[cat] ?? ["📁", cat.charAt(0).toUpperCase() + cat.slice(1)];
  return `${icon} - ${name}`;
};

/*
 * Satu pesan, satu tombol "List Menu". Di dalamnya:
 *   📂 Utama          → sub-list: Menu, Ping, Profil, Script
 *   🗂️ Kategori       → sub-list: tiap kategori
 *   ✦ Semua Kategori  → baris ↩ langsung (di luar Kategori)
 *   🚀 Support        → sub-list: Donasi, Owner
 * Pilih kategori → daftar command-nya tampil; pesan itu membawa list menu yang sama.
 * Command khusus owner disembunyikan dari non-owner.
 */
export default definePlugin({
  name: "menu",
  aliases: ["help", "start"],
  category: "general",
  description: "Show the command list",
  usage: "menu [kategori|all]",
  async run({ ctx, sock, config, registry, user, role, db }) {
    const pfx = ctx.pfx;
    const visible = (p) => role.owner || !p.access?.owner;
    // Hanya nama utama command — alias (mis. .catur untuk .chess) tidak pernah ditampilkan di menu.
    const aliasSet = new Set(registry.plugins.flatMap((p) => p.aliases));
    const seen = new Set();
    const unique = (p) => !aliasSet.has(p.name) && !seen.has(p.name) && seen.add(p.name);
    const categories = new Map(
      [...registry.categories()].map(([cat, list]) => [cat, list.filter(visible).filter(unique)]).filter(([, list]) => list.length),
    );
    const total = [...categories.values()].reduce((n, list) => n + list.length, 0);
    const arg = ctx.argsStr.toLowerCase().trim();

    // "Popular" (hijau, English) = 3 kategori yang paling sering dipakai (statistik command); belum ada data → bawaan.
    const usage = [...categories].map(([cat, list]) => [cat, list.reduce((n, p) => n + (db.stats?.[p.name] ?? 0), 0)]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const popular = new Set(usage.length ? usage.slice(0, 3).map(([cat]) => cat) : FALLBACK_POPULAR);
    const features = (n) => tr(`${n} fitur`, n === 1 ? "1 feature" : `${n} features`);
    // Baris pilihan: judul + deskripsi; kanan: total fitur (header) & lencana hijau "Popular" (highlight_label).
    const row = ({ title, description, n, id, hot }) => ({ title, description, header: features(n), id, ...(hot && { highlight_label: "Popular" }) });

    const block = (title, list) => [
      `╭─❮ *${sc(title)}* ❯`,
      ...list.map((p) => `│ ◦ ${pfx}${p.name}`),
      `╰─ ${t("mn.count", { n: list.length })}`,
    ];

    let lines;
    if (arg === "all") {
      lines = [...categories].flatMap(([cat, list]) => [...block(cat, list), ""]);
    } else if (arg) {
      const list = categories.get(arg);
      if (!list) {
        return ctx.reply(t("mn.noCat", { cat: arg, list: [...categories.keys()].join(", ") }));
      }
      lines = block(arg, list);
    } else {
      lines = [
        `${greeting(config.timezone)}, *${ctx.pushName}* 👋`,
        t("mn.hello", { bot: config.name }),
        "",
        `╭─❮ *${sc(t("mn.info"))}* ❯`,
        `│ ◦ ${sc(t("mn.lLimit"))}   : ${user.limit}`,
        `│ ◦ ${sc(t("mn.lLevel"))}   : ${user.level} · ${rankLabel(user.level)}`,
        `│ ◦ ${sc(t("mn.lUptime"))}  : ${uptime(process.uptime())}`,
        `│ ◦ ${sc(t("mn.lTime"))}   : ${clockTime(config.timezone)}`,
        `│ ◦ ${sc(t("mn.lTotal"))}   : ${t("mn.count", { n: total })}`,
        "╰─────────────",
      ];
    }

    // "Semua Kategori" tidak di dalam sub-list Kategori, tapi baris ↩ langsung di List Menu.
    const allRow = { title: t("mn.all"), description: tr("Semua command dari semua kategori sekaligus", "Every command from every category at once"), id: `${pfx}menu all` };

    const groups = [
      {
        title: t("mn.mainTitle"),
        label: t("mn.mainLabel"),
        select: true,
        rows: [
          row({ title: t("mn.rMenu"), description: tr("Tampilkan daftar semua command", "Show the full command list"), n: total, id: `${pfx}menu`, hot: true }),
          row({ title: t("mn.rPing"), description: tr("Cek kecepatan respons bot", "Check the bot's response speed"), n: 1, id: `${pfx}ping` }),
          row({ title: t("mn.rProfile"), description: tr("Kartu profil, level & statistikmu", "Your profile card, level & stats"), n: 1, id: `${pfx}profile`, hot: true }),
          row({ title: t("mn.rScript"), description: tr("Source code & repo bot", "Bot source code & repository"), n: 1, id: `${pfx}sc` }),
        ],
      },
      {
        title: t("mn.catTitle"),
        label: t("mn.catLabel"),
        select: true,
        rows: [
          ...[...categories].map(([cat, list]) =>
            row({ title: categoryTitle(cat), description: (CATEGORY_DESC[cat] ?? (() => t("mn.count", { n: list.length })))(), n: list.length, id: `${pfx}menu ${cat}`, hot: popular.has(cat) }),
          ),
        ],
      },
      { rows: [allRow] }, // baris ↩ langsung, tanpa judul
      {
        title: t("mn.supTitle"),
        label: t("mn.supLabel"),
        select: true,
        rows: [
          row({ title: t("mn.rDonate"), description: tr("Dukung server & pengembangan bot", "Support the server & development"), n: 1, id: `${pfx}donate` }),
          row({ title: t("mn.rOwner"), description: tr("Hubungi developer bot", "Contact the bot developer"), n: 1, id: `${pfx}owner` }),
        ],
      },
    ];

    const text = lines.join("\n").trim();

    // .menu <kategori> dan .menu all → balasan link preview (kartu besar). Hanya .menu polos yang interaktif.
    if (arg) {
      const count = arg === "all" ? total : categories.get(arg).length;
      return ctx.reply(text, {
        mentions: [ctx.senderId],
        preview: { large: true, title: arg === "all" ? t("mn.all").replace(/^✦ \| /, "📋 ") : t("mn.catPreviewTitle", { cat: arg }), body: t("mn.count", { n: count }) },
      });
    }
    const quoted = await ctx.quote();
    // select → sub-list di dalam List Menu; selain itu → baris ↩ langsung. Semua dibungkus satu tombol.
    const buttons = groups.flatMap((g) =>
      g.select
        ? [{ type: "list", text: g.label ?? g.title, sections: [{ title: g.title, rows: g.rows }] }]
        : g.rows.map((r) => ({ type: "quick", text: r.title, id: r.id })),
    );

    await sendInteractive(sock, ctx.chatId, {
      text,
      buttons,
      wrap: { text: "リストメニュー", title: "All Menu" },
      mentions: [ctx.senderId],
      quoted,
    });
  },
});
