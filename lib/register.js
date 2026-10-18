import crypto from "node:crypto";
import { cardPayload, fetchAvatar, renderCard } from "#lib/cards";
import { config } from "#lib/config";
import { db } from "#lib/database";
import { logger } from "#lib/logger";
import { registry } from "#lib/plugins";
import { editPayload } from "#lib/preview";
import { getRpg, registerGift } from "#lib/rpg";
import { numberOf, sleep } from "#lib/utils";

/*
 * Registrasi pengguna. Wajib sebelum memakai fitur bot (kecuali owner).
 *   .register → Nama? → Umur? → Gender? → kartu register (pesan "Register Di Proses" diedit sampai jadi kartu)
 * Data tersimpan di database/users.json → user.reg = { on, name, age, gender, sn, no, at }
 * Matikan kewajibannya: config.json → features.registerRequired = false
 */
export const isRegistered = (user) => Boolean(user?.reg?.on);

const EXEMPT = new Set(["register"]); // command yang boleh dipakai sebelum terdaftar
const SESSION_TTL = 5 * 60_000;
const HINT_COOLDOWN = 60_000;
const sessions = new Map(); // "chat|pengirim" → { step, data, at }
const hinted = new Map(); // pengirim → ms

const keyOf = (ctx) => `${ctx.chatId}|${ctx.senderId}`;
const required = () => config.features?.registerRequired !== false;

const ZONE = { "Asia/Jakarta": "WIB", "Asia/Pontianak": "WIB", "Asia/Makassar": "WITA", "Asia/Jayapura": "WIT" };
export const formatRegDate = (ms) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("id-ID", { timeZone: config.timezone, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}${ZONE[config.timezone] ? ` ${ZONE[config.timezone]}` : ""}`;
};

const makeSN = () => {
  const used = new Set(Object.values(db.users).map((u) => u.reg?.sn));
  for (;;) {
    const sn = crypto.randomBytes(6).toString("hex").toUpperCase().match(/.{4}/g).join("-");
    if (!used.has(sn)) return sn;
  }
};

const nextNo = () => {
  db.settings.regCounter = (db.settings.regCounter ?? Object.values(db.users).filter((u) => u.reg?.on).length) + 1;
  return String(db.settings.regCounter).padStart(4, "0");
};

export const statusOf = (jid, user, role) => {
  const owner = role ? role.owner : config.owners.has(numberOf(jid)) || db.isExtraOwner({ pn: jid, lid: jid });
  if (owner) return "OWNER";
  return (role ? role.premium : user?.premium?.on) ? "PREMIUM" : "FREE";
};

// Kartu register (Buffer JPEG) milik `jid`.
export const makeCard = async (sock, jid, user, status) =>
  renderCard("register", {
    name: user.reg.name,
    fallbackName: numberOf(jid),
    age: user.reg.age,
    gender: user.reg.gender,
    number: numberOf(jid),
    status,
    sn: user.reg.sn,
    no: user.reg.no,
    date: formatRegDate(user.reg.at),
    level: user.level ?? 1,
    avatar: await fetchAvatar(sock, jid),
  });

export const cardCaption = (user, jid, title = "🪪 *KARTU REGISTER*") =>
  [
    title,
    "",
    `👤 Nama   : *${user.reg.name}*`,
    `🎂 Umur   : ${user.reg.age} tahun`,
    `⚧️ Gender : ${user.reg.gender}`,
    `📱 Nomor  : +${numberOf(jid)}`,
    `🔖 SN     : ${user.reg.sn}`,
    `🎫 No.    : ${user.reg.no}`,
  ].join("\n");

// Kirim kartu sebagai pesan baru (dipakai .kartu). Gaya mengikuti db.settings.cardStyle.
export const sendCard = async (env, jid, user, status) => {
  const { sock, ctx } = env;
  const card = await makeCard(sock, jid, user, status);
  const text = cardCaption(user, jid);
  const style = db.settings.cardStyle ?? "preview";
  const info = { text, mentions: [jid], title: "🪪 Kartu Register", body: `${user.reg.name} • SN ${user.reg.sn}` };
  for (const attempt of style === "image" ? ["image", "preview"] : ["preview", "image"]) {
    try {
      return await sock.sendMessage(ctx.chatId, cardPayload(card, { ...info, style: attempt }), { quoted: await ctx.quote() });
    } catch (err) {
      logger.warn(`Kartu register (${attempt}) gagal terkirim: ${err.message}`);
    }
  }
  return ctx.reply(text, { mentions: [jid] });
};

/* ── alur tanya-jawab ───────────────────────────────────────────────────── */
const parseName = (text) => {
  const name = String(text).replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 24 || !/[\p{L}\p{N}]/u.test(name)) return null;
  return name;
};
const parseAge = (text) => {
  const n = Number(String(text).match(/\d{1,3}/)?.[0]);
  return Number.isInteger(n) && n >= 5 && n <= 99 ? n : null;
};
const parseGender = (text) => {
  const s = String(text).toLowerCase().replace(/[^a-z]/g, "");
  if (/^(male|m|l|laki|lakilaki|pria|cowok|cowo|cwo|boy)$/.test(s)) return "Laki-laki";
  if (/^(female|f|p|perempuan|wanita|cewek|cewe|cwe|girl)$/.test(s)) return "Perempuan";
  return null;
};

export const startRegister = async (env) => {
  const { ctx, user } = env;
  if (isRegistered(user)) {
    return ctx.reply(`✅ Kamu sudah terdaftar sebagai *${user.reg.name}*.\n🪪 Lihat kartumu: *${ctx.prefix}kartu*\n🗑️ Daftar ulang: *${ctx.prefix}unreg*`);
  }
  sessions.set(keyOf(ctx), { step: "name", data: {}, at: Date.now() });
  await ctx.reply("📝 *REGISTRASI*\n\n👤 Nama siapa?\n_Ketik namamu. Ketik *batal* untuk membatalkan._");
};

// Edit pesan proses — tetap membawa label "diteruskan dari channel" + kartu pratinjau (kalau ditolak, edit teks polos).
const progress = async (sock, chatId, sent, text, extra = {}) => {
  try {
    return await sock.sendMessage(chatId, editPayload(sent.key, text, extra));
  } catch {
    return sock.sendMessage(chatId, { text, edit: sent.key, ...extra });
  }
};

const finish = async (env, data) => {
  const { sock, ctx, user, role } = env;
  const sent = await ctx.reply("⏳ *Register Di Proses...*");

  user.reg = { on: true, name: data.name, age: data.age, gender: data.gender, sn: makeSN(), no: nextNo(), at: Date.now() };
  db.save("users", "settings");

  const status = statusOf(ctx.senderId, user, role);
  const rendering = makeCard(sock, ctx.senderId, user, status).catch((err) => {
    logger.warn(`Kartu register gagal dirender: ${err.message}`);
    return null;
  });

  await sleep(1200);
  await progress(sock, ctx.chatId, sent, "🛠️ *Sedang Menyiapkan...*\n▰▰▰▱▱ kartu register kamu").catch(() => {});
  const card = await rendering;
  await sleep(900);

  // Hadiah pendaftaran (RPG): gold + ramuan + peti, ditampilkan di caption kartu.
  const gift = registerGift(getRpg(user));
  db.save("users");
  const text = [
    cardCaption(user, ctx.senderId, "✅ *REGISTRASI BERHASIL*"),
    ...(gift.length ? ["", "🎁 *Hadiah registrasi*", ...gift.map((g) => `• ${g.text}`), `_Main RPG: ketik *${ctx.prefix}rpg help*_`] : []),
  ].join("\n");
  const mentions = [ctx.senderId];

  if (!card) {
    // Kartu gagal dibuat → data tetap tampil sebagai teks.
    return progress(sock, ctx.chatId, sent, text, { mentions }).catch(() => ctx.reply(text, { mentions }));
  }

  // Pesan proses diedit jadi "selesai" (WhatsApp hanya bisa mengedit teks), lalu kartu dikirim sebagai GAMBAR — pasti tampil.
  await progress(sock, ctx.chatId, sent, "✅ *Register Selesai!*\n🪪 Kartumu ada di bawah…").catch(() => {});
  await sleep(500);
  const info = { text, mentions, title: "🪪 Kartu Register", body: `${user.reg.name} • SN ${user.reg.sn}` };
  const quoted = await ctx.quote();
  for (const attempt of (db.settings.cardStyle ?? "preview") === "image" ? ["image", "preview"] : ["preview", "image"]) {
    try {
      return await sock.sendMessage(ctx.chatId, cardPayload(card, { ...info, style: attempt }), { quoted });
    } catch (err) {
      logger.warn(`Kartu register (${attempt}) gagal terkirim: ${err.message}`);
    }
  }
  return ctx.reply(text, { mentions });
};

const flow = async (env, session) => {
  const { ctx } = env;
  const text = String(ctx.text ?? "").trim();
  session.at = Date.now();

  if (session.step === "name") {
    const name = parseName(text);
    if (!name) return ctx.reply("❌ Nama tidak valid (2–24 karakter, harus ada huruf / angka).\n👤 Nama siapa?");
    session.data.name = name;
    session.step = "age";
    return ctx.reply(`Halo, *${name}*! 👋\n\n🎂 Umur berapa?\n_Contoh: 17_`);
  }
  if (session.step === "age") {
    const age = parseAge(text);
    if (!age) return ctx.reply("❌ Umur harus angka antara 5–99.\n🎂 Umur berapa?");
    session.data.age = age;
    session.step = "gender";
    return ctx.reply("⚧️ Gender?\n_Male / Female atau Laki² / Perempuan_");
  }
  const gender = parseGender(text);
  if (!gender) return ctx.reply("❌ Pilih salah satu: *Male* / *Female* atau *Laki²* / *Perempuan*.\n⚧️ Gender?");
  sessions.delete(keyOf(ctx));
  return finish(env, { ...session.data, gender });
};

export const unregisteredHint = async ({ ctx }) => {
  const last = hinted.get(ctx.senderId) ?? 0;
  if (Date.now() - last < HINT_COOLDOWN) return;
  hinted.set(ctx.senderId, Date.now());
  await ctx.reply(`🔒 Kamu belum terdaftar.\nKetik *${ctx.prefix ?? "."}register* dulu untuk memakai bot.`);
};

/*
 * Middleware handler (setelah autoreply, sebelum commands):
 *   1) jawaban untuk sesi registrasi yang sedang berjalan  2) blokir command bagi yang belum terdaftar.
 */
export const registration = async (env, next) => {
  const { ctx, role, user } = env;
  if (ctx.fromMe || ctx.isStatus) return next();

  const key = keyOf(ctx);
  const session = sessions.get(key);
  if (session) {
    if (Date.now() - session.at > SESSION_TTL) sessions.delete(key);
    else if (ctx.isCmd) sessions.delete(key); // memakai command lain = membatalkan sesi
    else if (ctx.text?.trim()) {
      if (/^(batal|cancel|stop)$/i.test(ctx.text.trim())) {
        sessions.delete(key);
        return ctx.reply("🚫 Registrasi dibatalkan.");
      }
      return flow(env, session);
    }
  }

  if (!ctx.isCmd || role.owner || isRegistered(user) || !required()) return next();
  const plugin = registry.resolve(ctx.command);
  if (!plugin || EXEMPT.has(plugin.name)) return next();
  return unregisteredHint(env);
};
