/*
 * Aturan akses command (owner / premium / grup / private / admin / bot-admin).
 * Dipakai handler untuk command biasa dan AutoAI untuk tindakan yang dipicu bahasa alami.
 */
export const DENIED = {
  owner: "❌ Perintah ini khusus *Owner*.",
  premium: "💎 Fitur ini khusus *Premium*.",
  group: "👥 Perintah ini hanya bisa dipakai di *grup*.",
  private: "👤 Perintah ini hanya bisa dipakai di *chat pribadi*.",
  admin: "🛡️ Perintah ini khusus *admin grup*.",
  botAdmin: "🤖 Jadikan bot sebagai *admin grup* dulu.",
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
