import { definePlugin } from "#lib/plugins";

const INVITE = /chat\.whatsapp\.com\/([A-Za-z0-9]{10,})/i;

const join = definePlugin({
  name: "join",
  aliases: ["joingc"],
  category: "owner",
  description: "Bot masuk grup lewat link undangan",
  usage: "join <link grup>",
  access: { owner: true },
  async run({ sock, ctx }) {
    const code = (ctx.argsStr.match(INVITE) ?? ctx.quotedText?.match(INVITE))?.[1];
    if (!code) return ctx.reply(`❌ Contoh: *${ctx.prefix}join https://chat.whatsapp.com/xxxx*`);

    const result = await sock.groupAcceptInvite(code);
    await ctx.reply(result ? "✅ Berhasil masuk grup." : "⏳ Permintaan bergabung dikirim (menunggu persetujuan admin).");
  },
});

const leave = definePlugin({
  name: "leave",
  aliases: ["out", "keluar"],
  category: "owner",
  description: "Bot keluar dari grup ini",
  access: { owner: true, group: true },
  async run({ sock, ctx }) {
    await ctx.reply("👋 Sampai jumpa semuanya!", { quoted: false });
    await sock.groupLeave(ctx.chatId);
  },
});

export default [join, leave];
