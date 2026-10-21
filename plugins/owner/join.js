import { definePlugin } from "#lib/plugins";
import { t as tl } from "#lib/i18n";

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
    if (!code) return ctx.reply(tl("own.join.1", { prefix: ctx.pfx }));

    const result = await sock.groupAcceptInvite(code);
    await ctx.reply(result ? tl("own.join.2") : tl("own2.join.1"));
  },
});

const leave = definePlugin({
  name: "leave",
  aliases: ["out", "keluar"],
  category: "owner",
  description: "Bot keluar dari grup ini",
  access: { owner: true, group: true },
  async run({ sock, ctx }) {
    await ctx.reply(tl("jn3.1"), { quoted: false });
    await sock.groupLeave(ctx.chatId);
  },
});

export default [join, leave];
