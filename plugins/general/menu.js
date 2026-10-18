import { definePlugin } from "#lib/plugins";
import { sendInteractive } from "#lib/interactive";
import { clockTime, greeting, smallCaps as sc, uptime } from "#lib/utils";

// Baris kategori ditulis sama seperti baris lain: "emoji - Nama".
const CATEGORY_LOOK = {
  ai: ["🤖", "AI"],
  downloader: ["📥", "Downloader"],
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
  description: "Tampilkan daftar command",
  usage: "menu [kategori|all]",
  async run({ ctx, sock, config, registry, user, role }) {
    const pfx = ctx.prefix;
    const visible = (p) => role.owner || !p.access?.owner;
    const categories = new Map(
      [...registry.categories()].map(([cat, list]) => [cat, list.filter(visible)]).filter(([, list]) => list.length),
    );
    const total = [...categories.values()].reduce((n, list) => n + list.length, 0);
    const arg = ctx.argsStr.toLowerCase().trim();

    const block = (title, list) => [
      `╭─❮ *${sc(title)}* ❯`,
      ...list.map((p) => `│ ◦ ${pfx}${p.name}`),
      `╰─ ${list.length} ${sc("command")}`,
    ];

    let lines;
    if (arg === "all") {
      lines = [...categories].flatMap(([cat, list]) => [...block(cat, list), ""]);
    } else if (arg) {
      const list = categories.get(arg);
      if (!list) {
        return ctx.reply(`❌ Kategori *${arg}* tidak ada.\n📋 Tersedia: ${[...categories.keys()].join(", ")}`);
      }
      lines = block(arg, list);
    } else {
      lines = [
        `${greeting(config.timezone)}, *${ctx.pushName}* 👋`,
        `Aku *${config.name}*, asisten WhatsApp-mu.`,
        "",
        `╭─❮ *${sc("information")}* ❯`,
        `│ ◦ ${sc("limit")}   : ${user.limit}`,
        `│ ◦ ${sc("level")}   : ${user.level}`,
        `│ ◦ ${sc("uptime")}  : ${uptime(process.uptime())}`,
        `│ ◦ ${sc("waktu")}   : ${clockTime(config.timezone)}`,
        `│ ◦ ${sc("total")}   : ${total} command`,
        "╰─────────────",
      ];
    }

    // "Semua Kategori" tidak di dalam sub-list Kategori, tapi baris ↩ langsung di List Menu.
    const allRow = { title: "✦ | Semua Kategori", description: `${total} command`, id: `${pfx}menu all` };

    const groups = [
      {
        title: "Utama",
        label: "📂 | Utama",
        select: true,
        rows: [
          { title: "📋 - Menu", id: `${pfx}menu` },
          { title: "🏓 - Ping", id: `${pfx}ping` },
          { title: "👤 - Profil", id: `${pfx}profil` },
          { title: "📜 - Script", id: `${pfx}sc` },
        ],
      },
      {
        title: "Kategori",
        label: "🗂️ | Kategori",
        select: true,
        rows: [
          ...[...categories].map(([cat, list]) => ({
            title: categoryTitle(cat),
            description: `${list.length} command`,
            id: `${pfx}menu ${cat}`,
          })),
        ],
      },
      { rows: [allRow] }, // baris ↩ langsung, tanpa judul
      {
        title: "Support",
        label: "🚀 | Support",
        select: true,
        rows: [
          { title: "💖 - Donasi", id: `${pfx}donate` },
          { title: "👨‍💻 - Owner", id: `${pfx}owner` },
        ],
      },
    ];

    const quoted = await ctx.quote();
    const text = lines.join("\n").trim();
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
