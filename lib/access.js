import { t } from "#lib/i18n";

/*
 * Aturan akses command (owner / premium / grup / private / admin / bot-admin).
 * Dipakai handler untuk command biasa dan AutoAI untuk tindakan yang dipicu bahasa alami.
 */
// Teks penolakan mengikuti bahasa pesan yang sedang diproses (config/lang/*.json → denied.*).
export const DENIED = {
  get owner() { return t("denied.owner"); },
  get premium() { return t("denied.premium"); },
  get group() { return t("denied.group"); },
  get private() { return t("denied.private"); },
  get admin() { return t("denied.admin"); },
  get botAdmin() { return t("denied.botAdmin"); },
};

// Mengembalikan teks penolakan, atau null bila boleh.
export const authorize = async (plugin, env) => {
  const { ctx, role } = env;
  const rule = plugin.access;

  if (rule.owner && !role.owner) return DENIED.owner;
  if (rule.premium && !role.premium) return DENIED.premium;
  if (rule.group && !ctx.isGroup) return DENIED.group;
  if (rule.private && ctx.isGroup) return DENIED.private;

  if (ctx.isGroup && (rule.admin || rule.botAdmin)) {
    const { isAdmin, isBotAdmin } = await env.group();
    if (rule.botAdmin && !isBotAdmin) return DENIED.botAdmin;
    if (rule.admin && !isAdmin && !role.owner) return DENIED.admin;
  }
  return null;
};
