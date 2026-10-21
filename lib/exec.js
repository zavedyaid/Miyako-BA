import { authorize } from "#lib/access";
import { config } from "#lib/config";
import { db } from "#lib/database";
import { groups } from "#lib/groups";
import { announceLevelUp } from "#lib/levelup";
import { logger } from "#lib/logger";
import { usageCard, usageNeeded } from "#lib/usage";
import { gainExp } from "#lib/utils";
import { t as tl } from "#lib/i18n";

/*
 * Satu pintu untuk menjalankan command (dipakai handler dan AutoAI):
 * akses → limit (dipotong di muka, dikembalikan bila gagal) → statistik & EXP → jalankan → pesan limit → naik level.
 */
const LOW = 3;

// Pesan setelah limit terpakai. Matikan dengan  .off owner limitnotice
export const limitNotice = ({ cost, left }) => {
  const total = config.limit?.default;
  const lines = [`🎟️ Limit terpakai *${cost}* • sisa *${left}*${total ? `/${total}` : ""}`];
  if (left <= 0) lines.push(tl("lb.exec.exec.1"));
  else if (left <= LOW) lines.push("⚠️ Limit hampir habis.");
  return lines.join("\n");
};

export const executeCommand = async (plugin, env, { announce = true } = {}) => {
  const { ctx, role, user } = env;

  const denied = await authorize(plugin, env);
  if (denied) {
    await ctx.reply(denied);
    return { ran: false, denied: true };
  }

  // Perintah tidak jelas (kosong / "help") → tampilkan cara pakai, tanpa memotong limit.
  if (usageNeeded(plugin, ctx)) {
    await ctx.reply(usageCard(plugin, ctx.pfx));
    return { ran: false, usage: true };
  }

  const cost = plugin.limit ?? 0;
  const charged = cost > 0 && !role.premium;
  if (charged) {
    if (user.limit < cost) {
      await ctx.reply(tl("lb.exec.exec.2", { limit: user.limit, cost }));
      return { ran: false, noLimit: true };
    }
    user.limit -= cost;
  }

  db.stats[plugin.name] = (db.stats[plugin.name] ?? 0) + 1;
  const levelBefore = user.level;
  gainExp(user, plugin.exp);
  db.save("users", "stats");

  logger.cmd({
    command: `${ctx.pfx}${ctx.command}`,
    name: ctx.pushName,
    number: ctx.senderNumber,
    where: ctx.isGroup ? (groups.peek(ctx.chatId)?.subject ?? "grup") : null,
  });
  ctx.typing?.();

  let failed = false;
  try {
    await plugin.run(env);
  } catch (err) {
    failed = true;
    if (charged) {
      user.limit += cost;
      db.save("users");
    }
    logger.error(`[${plugin.name}] ${err.stack ?? err.message}`);
    await ctx.reply(`❌ Terjadi kesalahan: ${err.message}`);
  }

  // Limit terpakai & tidak gagal → kabari sisa limitnya.
  if (!failed && charged && config.features?.limitNotice !== false) {
    await ctx.reply(limitNotice({ cost, left: user.limit }), { quoted: false, preview: false }).catch(() => {});
  }

  // Setelah balasan command terkirim, baru umumkan kalau naik level.
  if (announce) await announceLevelUp(env, levelBefore);
  return { ran: true, failed };
};
