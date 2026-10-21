import { trackAtm } from "#lib/atmtrail";
import { db } from "#lib/database";
import * as game from "#lib/rpg";
import { isRegistered } from "#lib/register";
import { sendAtm } from "#lib/rpgui";

/*
 * Alur ATM (PIN tidak pernah diketik di grup):
 *   .buy atm → .register atm (bot DM panduan) → di chat pribadi: .register atm <Nomor Serial> <PIN 4-6 angka> → Berhasil
 *   Terkunci lagi (10 mnt / bot restart): .atm di grup → bot DM → di pribadi: LANGSUNG ketik PIN-nya (angka 4–6 digit, tanpa perintah) → kartu ATM muncul di grup tadi.
 */
const PENDING_MS = 5 * 60_000;
const pending = (globalThis.__miyakoAtmPending ??= new Map()); // SN → { chat, sender, at }

const norm = (x) => String(x ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
const dm = async (env, text) => trackAtm(env, await env.sock.sendMessage(env.ctx.senderPn ?? env.ctx.senderId, { text }));

const guide = (p) => [
  "🏧 *DAFTAR ATM*",
  "",
  `Balas chat ini dengan:`,
  `*${p}register atm <Nomor Serial> <PIN>*`,
  "",
  `• Nomor Serial → lihat di *${p}profil* / *${p}kartu*`,
  "• PIN → 4–6 angka, buatanmu sendiri (jangan dikirim di grup)",
  "",
  `Contoh: *${p}register atm SN-ABC123 482913*`,
].join("\n");

export const dmRegisterGuide = (env) => dm(env, guide(env.ctx.pfx)).catch(() => {});

const gate = (env) => {
  const { ctx, user } = env;
  if (!isRegistered(user)) { ctx.reply(`Daftar akun dulu: *${ctx.pfx}register*`); return null; }
  const r = game.getRpg(user);
  if (!game.hasAtm(r)) { ctx.reply(`🏧 Kamu belum punya *Kartu ATM*. Beli dulu: *${ctx.pfx}buy atm*`); return null; }
  return r;
};

// .register atm [SN] [PIN]
export const registerAtm = async (env) => {
  const { ctx, user } = env, p = ctx.pfx;
  const r = gate(env);
  if (!r) return;
  if (game.hasPin(r)) return ctx.reply(`✅ ATM-mu sudah terdaftar.\nBuka: *${p}atm* · ganti PIN (chat pribadi): *${p}setpin <PIN lama> <PIN baru>*`);

  const [, sn, pin] = ctx.args;
  if (ctx.isGroup) {
    if (sn || pin) ctx.delete().catch(() => {}); // jangan biarkan PIN terbaca di grup
    try { await dm(env, guide(p)); } catch { return ctx.reply("❌ Bot tidak bisa mengirim chat pribadi. Chat bot dulu (ketik apa saja di pribadi), lalu ulangi."); }
    return ctx.reply("📩 Cek *chat pribadi* dari bot untuk mendaftarkan ATM.");
  }
  if (!sn || !pin) return ctx.reply(guide(p));
  if (norm(sn) !== norm(user.reg?.sn)) return ctx.reply(`❌ Nomor Serial salah. Cek di *${p}profil* atau *${p}kartu*.`);
  if (!game.validPin(pin)) return ctx.reply("❌ PIN harus *4–6 angka* (contoh: 482913).");
  game.setPin(r, pin);
  db.save("users");
  await ctx.reply(`✅ *Berhasil!* ATM terdaftar.\nBuka ATM kapan saja: ketik *${p}atm* di grup, lalu masukkan PIN di chat pribadi.`);
};

// .atm saat ATM terkunci
export const requestAtm = async (env, r) => {
  const { ctx, user } = env, p = ctx.pfx;
  if (!game.hasPin(r)) return ctx.reply(`🔑 ATM-mu belum didaftarkan. Ketik *${p}register atm*`);
  const wait = game.pinLockedMinutes(r);
  if (wait) return ctx.reply(`⛔ Terlalu banyak salah PIN. ATM terkunci *${wait} menit* lagi.`);
  pending.set(user.reg.sn, { chat: ctx.chatId, sender: ctx.senderId, at: Date.now() });
  const ask = `🔐 *BUKA ATM*\nKetik PIN ATM-mu di sini — langsung angkanya saja (4–6 digit).\n\n_Berlaku 5 menit. Kartu ATM akan muncul ${ctx.isGroup ? "di grup tadi" : "di chat ini"}._`;
  if (!ctx.isGroup) return trackAtm(env, await ctx.reply(ask));
  try { await dm(env, ask); } catch { return ctx.reply("❌ Bot tidak bisa mengirim chat pribadi. Chat bot dulu (ketik apa saja di pribadi), lalu ulangi."); }
  return trackAtm(env, await ctx.reply("🔒 ATM terkunci. 📩 Cek *chat pribadi* dari bot dan ketik PIN-mu — kartu ATM akan muncul di sini."));
};

// Lingkungan "seolah-olah" pesan datang dari chat asal — supaya kartu ATM terkirim ke grup, bukan ke pribadi.
const originEnv = (env, pend) => ({
  ...env,
  ctx: {
    ...env.ctx,
    chatId: pend.chat,
    senderId: pend.sender,
    isGroup: pend.chat.endsWith("@g.us"),
    quote: async () => undefined,
    reply: (content, opts = {}) => env.sock.sendMessage(pend.chat, typeof content === "string" ? { text: content, ...(opts.mentions && { mentions: opts.mentions }) } : content),
  },
});

// PIN diketik langsung di chat pribadi (tanpa perintah). `given` = PIN dari pesan biasa; .atmpin <PIN> tetap berfungsi.
export const hasPending = (env) => {
  const sn = env.user?.reg?.sn, pend = sn ? pending.get(sn) : null;
  return Boolean(pend && Date.now() - pend.at <= PENDING_MS);
};

export const submitPin = async (env, given) => {
  const { ctx, user } = env, p = ctx.pfx;
  const r = game.getRpg(user);
  const pend = user.reg?.sn ? pending.get(user.reg.sn) : null;
  if (!pend || Date.now() - pend.at > PENDING_MS) return ctx.reply(`Ketik *${p}atm* di grup dulu, baru ketik PIN di sini.`);
  const wait = game.pinLockedMinutes(r);
  if (wait) return ctx.reply(`⛔ Terlalu banyak salah PIN. Coba lagi *${wait} menit* lagi.`);
  const pin = given ?? ctx.args[0];
  if (!pin) return ctx.reply("Ketik PIN-mu langsung di sini (4–6 digit angka).");
  if (!game.checkPin(r, pin)) {
    const left = game.pinFailed(r);
    db.save("users");
    return ctx.reply(left ? `❌ PIN salah. Sisa percobaan: *${left}*` : "⛔ PIN salah 5×. ATM terkunci *10 menit*.");
  }
  game.pinOk(r);
  game.openAtm(pend.sender);
  pending.delete(user.reg.sn);
  db.save("users");
  trackAtm(env, await ctx.reply("✅ PIN benar. ATM terbuka 10 menit."));
  const gain = game.accrue(r);
  db.save("users");
  const note = `✅ ATM terbuka 10 menit.\n${gain ? `Bunga masuk: +${Number(gain).toLocaleString("id-ID")} G` : `${p}deposit <jumlah|all> · ${p}tarik <jumlah|all> · ${p}transfer @tag <jumlah>`}`;
  await sendAtm(originEnv(env, pend), r, note, [pend.sender]);
};
