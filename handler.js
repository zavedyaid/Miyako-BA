/*
 * Miyako - BA — handler pesan masuk
 * Author  : ZavedyaID
 * GitHub  : https://github.com/ZavedyaID/Miyako-BA
 * License : MIT
 *
 * Alur: messages.upsert → ctx → identity → gate → exp → sapaan owner → afk → antilink → autoreply → registrasi → commands
 */

import { generateMessageIDV2 } from "#lib/baileys";
import { config, isOwnerIdentity } from "#lib/config";
import { db } from "#lib/database";
import { groups, inspectGroup } from "#lib/groups";
import { executeCommand } from "#lib/exec";
import { announceLevelUp } from "#lib/levelup";
import { greetOwner } from "#lib/ownergreet";
import { registration } from "#lib/register";
import { logger } from "#lib/logger";
import { registry } from "#lib/plugins";
import { buildContext } from "#lib/serialize";
import { bare, closest, duration, gainExp, messageCache, numberOf, pick, randomInt, slugify, toNumber } from "#lib/utils";

const STATUS_REACTIONS = ["😍", "🔥", "💯", "🤩", "😭", "👏", "❤️"];
const LINK = /(https?:\/\/\S+|chat\.whatsapp\.com\/\S+)/i;
const MAX_WARN = 3;
const EXP_COOLDOWN = 10_000;
const lastExp = new Map();


const premiumActive = (user) => {
  if (!user.premium?.on) return false;
  if (user.premium.expiredAt && Date.now() > user.premium.expiredAt) {
    user.premium.on = false;
    db.save("users");
    return false;
  }
  return true;
};

const identity = (env, next) => {
  const { ctx } = env;
  const who = { pn: ctx.senderPn, lid: ctx.senderLid };
  const owner = ctx.fromMe || isOwnerIdentity(who) || db.isExtraOwner(who);

  env.user = db.user(ctx.senderId, ctx.pushName);
  env.chat = ctx.isGroup ? db.group(ctx.chatId) : null;
  env.role = { owner, premium: owner || premiumActive(env.user) };
  return next();
};

const gate = (env, next) => {
  const { sock, ctx, role, user, chat } = env;

  if (ctx.isStatus) {
    if (config.features?.statusReact && !ctx.fromMe && ctx.raw.key.participant) reactStatus(sock, ctx);
    return;
  }

  if (ctx.chatId.endsWith("@broadcast") || ctx.chatId.endsWith("@newsletter")) return;

  const selfMode = db.settings.selfMode ?? config.features?.selfMode ?? false;
  if (selfMode && !role.owner) return;
  if (!role.owner && (chat?.isBanned || user.banned)) return;

  return next();
};

// Lihat status lalu beri reaksi. WhatsApp hanya mengirim reaksi status ke JID yang disebut di statusJidList
// (pemilik status + akun bot sendiri); opsi lama "statusJid" tidak dikenali sehingga reaksi tidak pernah terkirim.
const reactStatus = async (sock, ctx) => {
  const key = ctx.raw.key;
  const recipients = [...new Set([ctx.senderPn, ctx.senderLid, key.participant, key.participantAlt, sock.user?.id, sock.user?.lid].filter(Boolean).map(bare))];
  try {
    await sock.readMessages([key]);
    await sock.sendMessage("status@broadcast", { react: { key, text: pick(STATUS_REACTIONS) } }, { statusJidList: recipients });
  } catch (err) {
    logger.warn(`Reaksi status gagal: ${err.message}`);
  }
};

// Tandai pesan masuk sebagai sudah dibaca (centang biru) di grup dan / atau chat pribadi.
// Nyalakan: .on owner autoread (semua) • .set owner autoread <all|group|private|off>
export const autoRead = (sock, ctx, msg) => {
  const mode = config.features?.autoRead;
  if (!mode || ctx.fromMe || ctx.isStatus || ctx.chatId.endsWith("@newsletter")) return;
  if (mode === "group" && !ctx.isGroup) return;
  if (mode === "private" && ctx.isGroup) return;
  sock.readMessages([msg.key]).catch(() => {});
};

const exp = (env, next) => {
  const { ctx, user } = env;
  const now = Date.now();

  if (!ctx.fromMe && ctx.text && now - (lastExp.get(ctx.senderId) ?? 0) > EXP_COOLDOWN) {
    lastExp.set(ctx.senderId, now);
    const before = user.level;
    gainExp(user, randomInt(1, 8));
    db.save("users");
    announceLevelUp(env, before);
  }
  return next();
};

const afk = (env, next) => {
  const { ctx, user } = env;

  if (user.afk >= 0 && !ctx.fromMe && ctx.command !== "afk") {
    const away = duration(Date.now() - user.afk);
    const reason = user.afkReason || "tidak ada alasan";
    user.afk = -1;
    user.afkReason = "";
    db.save("users");
    ctx.reply(`👋 Selamat datang kembali!\n✏️ *${reason}*\n⏱️ *${away}*`);
  }

  if (ctx.isGroup) {
    for (const jid of ctx.mentionedJid) {
      const target = db.users[jid];
      if (target?.afk >= 0) {
        ctx.reply(
          `⚠️ @${numberOf(jid)} sedang *AFK*\n✏️ ${target.afkReason || "-"}\n⏱️ ${duration(Date.now() - target.afk)}`,
          { mentions: [jid] },
        );
      }
    }
  }
  return next();
};

const antilink = async (env, next) => {
  const { sock, ctx, chat, role } = env;
  if (!ctx.isGroup || !chat?.antiLink || ctx.fromMe || role.owner || !LINK.test(ctx.text)) return next();

  const { isAdmin, isBotAdmin } = await env.group();
  if (!isBotAdmin || isAdmin) return next();

  sock.sendMessage(ctx.chatId, { delete: ctx.raw.key }).catch(() => {});

  chat.warnLink ??= {};
  const warns = (chat.warnLink[ctx.senderId] = (chat.warnLink[ctx.senderId] ?? 0) + 1);
  const tag = `@${numberOf(ctx.senderId)}`;
  const mentions = [ctx.senderId];

  if (warns >= MAX_WARN) {
    delete chat.warnLink[ctx.senderId];
    await ctx.reply(`🚫 ${tag} dikeluarkan karena ${MAX_WARN}x mengirim link.`, { quoted: false, mentions });
    sock.groupParticipantsUpdate(ctx.chatId, [ctx.senderId], "remove").catch(() => {});
  } else {
    ctx.reply(`⚠️ *Peringatan ${warns}/${MAX_WARN}* — ${tag}, dilarang mengirim link!`, { quoted: false, mentions });
  }
  db.save("groups");
};

const autoreply = async (env, next) => {
  const { sock, ctx } = env;
  const stored = ctx.text && !ctx.isCmd ? db.response[slugify(ctx.text)] : null;
  if (!stored) return next();

  try {
    await sock.relayMessage(ctx.chatId, stored, { messageId: generateMessageIDV2(sock.user?.id) });
  } catch {
    return next();
  }
};


const commands = async (env, next) => {
  const { ctx, role, user } = env;

  for (const plugin of registry.passives) {
    try {
      await plugin.passive(env);
    } catch (err) {
      logger.error(`[passive:${plugin.name}] ${err.message}`);
    }
  }

  if (!ctx.isCmd) return next();

  const plugin = registry.resolve(ctx.command);
  if (!plugin) {
    const guess = config.features?.cmdSuggest && !ctx.fromMe ? closest(ctx.command, registry.names) : null;
    if (guess) ctx.reply(`❓ Command *${ctx.prefix}${ctx.command}* tidak ditemukan.\n💡 Maksudmu *${ctx.prefix}${guess}*?`);
    return;
  }

  await executeCommand(plugin, env);
};

// Sapaan untuk owner di grup — berjalan sendiri, tidak menahan alur pesan.
const ownerGreet = (env, next) => {
  greetOwner(env).catch((err) => logger.warn(`Sapaan owner gagal: ${err.message}`));
  return next();
};

const middleware = [identity, gate, exp, ownerGreet, afk, antilink, autoreply, registration, commands];
const run = (env, i = 0) => middleware[i]?.(env, () => run(env, i + 1));

export const handleMessages = (sock) => async ({ messages, type }) => {
  for (const msg of messages) if (msg.key?.id) messageCache.set(msg.key.id, msg);
  if (type !== "notify") return;

  const staleAfter = config.behavior.staleAfterSeconds * 1000;

  for (const msg of messages) {
    (async () => {
      if (!msg.message || Date.now() - toNumber(msg.messageTimestamp) * 1000 > staleAfter) return;

      const ctx = await buildContext(sock, msg);
      if (!ctx) return;

      let info;
      const env = {
        sock,
        msg,
        ctx,
        db,
        config,
        registry,
        groups,
        user: null,
        chat: null,
        role: { owner: false, premium: false },
        group: () => (info ??= inspectGroup(env)),
      };

      autoRead(sock, ctx, msg);
      await run(env);
    })().catch((err) => logger.error(`messages.upsert: ${err.stack ?? err.message}`));
  }
};
