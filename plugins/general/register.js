import { definePlugin } from "#lib/plugins";
import { isRegistered, sendCard, startRegister, statusOf } from "#lib/register";
import { db } from "#lib/database";

/*
 * .register          → daftar (Nama → Umur → Gender) lalu dapat kartu register
 * .kartu [@tag]      → lihat kartu register sendiri / orang lain
 * .unreg ya          → hapus pendaftaran
 * Wajib terdaftar untuk memakai fitur bot (owner dikecualikan). Matikan: config.json → features.registerRequired
 */
const register = definePlugin({
  name: "register",
  aliases: ["daftar", "reg"],
  category: "general",
  description: "Daftar dulu untuk memakai bot (nama, umur, gender)",
  usage: "register",
  exp: 0,
  run: (env) => startRegister(env),
});

const kartu = definePlugin({
  name: "kartu",
  aliases: ["mycard", "cekreg", "idcard"],
  category: "general",
  description: "Lihat kartu register (kamu atau yang di-tag / di-reply)",
  usage: "kartu [@tag]",
  async run(env) {
    const { ctx, user, role, config } = env;
    const targetId = ctx.mentionedJid[0] ?? ctx.quotedSender ?? ctx.senderId;
    const self = targetId === ctx.senderId;
    const target = self ? user : db.users[targetId];

    if (!isRegistered(target)) {
      return ctx.reply(self ? `📝 Kamu belum terdaftar. Ketik *${ctx.prefix}register*.` : "📝 Orang itu belum terdaftar.");
    }
    ctx.react("⏳");
    await sendCard(env, targetId, target, self ? statusOf(targetId, target, role) : statusOf(targetId, target, null));
    ctx.react("✅");
  },
});

const unregister = definePlugin({
  name: "unregister",
  aliases: ["unreg", "hapusakun"],
  category: "general",
  description: "Hapus pendaftaran akunmu",
  usage: "unreg ya",
  exp: 0,
  async run({ ctx, user }) {
    if (!isRegistered(user)) return ctx.reply("📝 Kamu memang belum terdaftar.");
    if (!/^(ya|yes|y)$/i.test(ctx.args[0] ?? "")) {
      return ctx.reply(`⚠️ Pendaftaran *${user.reg.name}* (SN ${user.reg.sn}) akan dihapus dan kamu harus daftar ulang.\nLanjut? Ketik *${ctx.prefix}unreg ya*`);
    }
    user.reg = null;
    db.save("users");
    await ctx.reply("🗑️ Pendaftaran dihapus. Ketik *.register* untuk mendaftar lagi.");
  },
});

export default [register, kartu, unregister];
