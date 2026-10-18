import { definePlugin } from "#lib/plugins";
import { getRpg } from "#lib/rpg";
import { sendHero, sendInventory } from "#lib/rpgui";
import { db } from "#lib/database";

const inv = definePlugin({
  name: "inventory",
  aliases: ["inv", "tas", "bag"],
  category: "rpg",
  access: { group: true },
  description: "Lihat isi tas RPG (kartu)",
  usage: "inv [halaman]",
  async run(env) {
    const { ctx, user, db: store } = env;
    const r = getRpg(user);
    await sendInventory(env, r, Number(ctx.args[0]) || 1);
    store.save("users");
  },
});

const hero = definePlugin({
  name: "rpg",
  aliases: ["hero", "petualang"],
  category: "rpg",
  access: { group: true },
  description: "Kartu status petualangmu (atau yang di-tag). `.rpg help` = panduan game",
  usage: "rpg [@tag | help]",
  async run(env) {
    const { ctx, user } = env;
    if (/^(help|bantuan|panduan)$/i.test(ctx.args[0] ?? "")) {
      const p = ctx.prefix;
      return ctx.reply([
        "⚔️ *PANDUAN RPG MIYAKO*",
        "",
        `🧭 *Petualangan*: ${p}berburu · ${p}dungeon · ${p}nambang · ${p}mancing`,
        `🎁 *Hadiah*: ${p}daily · ${p}weekly · ${p}peti <id>`,
        `🎒 *Tas*: ${p}inv · ${p}pakai <item> · ${p}equip <item> · ${p}unequip`,
        `🏪 *Toko*: ${p}toko · ${p}buy/beli <id> [n] · ${p}sell/jual <id> [n|all]`,
        `🔨 *Tempa*: ${p}tempa (daftar resep) · ${p}tempa <id>`,
        `🏧 *Bank*: ${p}buy atm → ${p}setpin (chat pribadi) → ${p}atm <SN> <PIN> · ${p}deposit · ${p}tarik · ${p}tf @tag <jumlah> [dompet|bank] [dompet|bank]`,
        `🚖 *Driver*: ${p}ojol · ${p}gocar (Lv 3+) · ${p}gofood (Lv 2+) — rating bintang, tip, bonus streak, peti tiap 10 order`,
        `🤝 *Sosial*: ${p}kerja · ${p}misi`,
        `⚔️ *Lawan pemain (tag)*: ${p}duel @tag · ${p}balap @tag · ${p}rampok @tag · ${p}suitpvp @tag [taruhan]`,
        `🏆 *Peringkat*: ${p}leaderboard [petualang|uang|gold|limit|berlian|level|kill|dungeon|orderan|duel|suit|balap]`,
        `📊 *Status*: ${p}rpg`,
        "",
        "👥 Semua fitur RPG hanya bisa dipakai di *grup* (kecuali atur PIN & pilihan suit — lewat chat pribadi).",
        "",
        "⚡ Stamina pulih 1 per 45 detik, ❤️ HP pulih 1 per 20 detik.",
        "Naik level → HP pulih penuh + bonus gold.",
      ].join("\n"));
    }
    const targetId = ctx.mentionedJid[0] ?? ctx.quotedSender ?? ctx.senderId;
    const self = targetId === ctx.senderId;
    const target = self ? user : db.users[targetId];
    if (!target?.rpg && !self) return ctx.reply("🎮 Orang itu belum pernah main RPG.");
    const r = getRpg(target);
    await sendHero(env, r, targetId, self ? undefined : target.reg?.name ?? target.name ?? undefined);
    db.save("users");
  },
});

export default [inv, hero];
