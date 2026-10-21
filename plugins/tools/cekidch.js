import { definePlugin } from "#lib/plugins";
import { truncate } from "#lib/utils";
import { t as tl } from "#lib/i18n";

/*
 * Cek ID & detail lengkap channel WhatsApp.
 *   .cekidch https://whatsapp.com/channel/XXXX     (link channel)
 *   .cekidch 120363xxxxxxxxxx@newsletter           (JID channel)
 *   reply pesan yang diteruskan dari channel + .cekidch
 *   tambah "json" di akhir → kirim metadata mentah sebagai file .json
 */
const LINK = /whatsapp\.com\/channel\/([A-Za-z0-9_-]+)/i;
const JID = /(\d{10,}@newsletter)/i;

const text = (v) => (v && typeof v === "object" ? (v.text ?? v.value ?? "") : (v ?? ""));
const ts = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n > 1e12 ? n : n * 1000).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" });
};
const num = (v) => (Number.isFinite(Number(v)) ? new Intl.NumberFormat("id-ID").format(Number(v)) : null);

const flat = (meta) => ({ ...(meta?.thread_metadata ?? {}), ...(meta?.viewer_metadata ?? {}), ...meta });

const pictureUrl = (meta) => {
  const f = flat(meta);
  const path = f.picture?.directPath ?? f.picture?.direct_path ?? f.preview?.directPath ?? f.preview?.direct_path;
  const url = f.picture?.url ?? f.preview?.url;
  if (url && /^https?:/.test(url)) return url;
  return path ? `https://pps.whatsapp.net${path}` : null;
};

// Sumber: argumen → teks yang di-reply → pesan channel yang diteruskan
const sourceOf = (ctx) => {
  const forwarded = ctx.quoted?.[ctx.quotedType]?.contextInfo?.forwardedNewsletterMessageInfo?.newsletterJid;
  const haystack = [ctx.argsStr, ctx.quotedText, forwarded].filter(Boolean).join(" ");
  const code = haystack.match(LINK)?.[1];
  if (code) return { code };
  const jid = haystack.match(JID)?.[1];
  return jid ? { jid: jid.toLowerCase() } : null;
};

const fetchMeta = async (sock, { code, jid }) => {
  try {
    return await sock.newsletterMetadata(code ? "invite" : "jid", code ?? jid);
  } catch (err) {
    // Beberapa build hanya menerima satu argumen (JID)
    if (jid) return sock.newsletterMetadata(jid);
    throw err;
  }
};

const SHOWN = new Set([
  "id", "name", "description", "invite", "handle", "subscribers", "subscribers_count", "verification", "state", "creation_time", "mute",
  "picture", "preview", "reaction_codes", "nameTime", "descriptionTime", "thread_metadata", "viewer_metadata", "role",
]);

export default definePlugin({
  name: "cekidch",
  aliases: ["idch", "cekch", "channelinfo", "infoch"],
  category: "tools",
  description: "Cek ID & detail lengkap channel WhatsApp",
  usage: "cekidch <link channel | JID> [json]",
  limit: 1,
  async run({ sock, ctx }) {
    const source = sourceOf(ctx);
    if (!source) {
      return ctx.reply(tl("tool.cekidch.1", { prefix: ctx.pfx }), {
        preview: { title: tl("tool2.cekidch.1"), body: "Detail lengkap channel WhatsApp" },
      });
    }

    ctx.react("⏳");
    try {
      const meta = await fetchMeta(sock, source);
      if (!meta) throw new Error("Channel tidak ditemukan.");
      const f = flat(meta);

      const id = f.id ?? source.jid;
      const name = text(f.name);
      const desc = text(f.description);
      const invite = f.invite ?? source.code;
      const subs = num(f.subscribers ?? f.subscribers_count);
      const created = ts(f.creation_time ?? f.creationTime);
      const reactions = Array.isArray(f.reaction_codes) ? f.reaction_codes.join(", ") : f.reaction_codes;
      const verified = f.verification ? String(f.verification).toUpperCase() : null;

      const extra = Object.entries(f)
        .filter(([key, value]) => !SHOWN.has(key) && ["string", "number", "boolean"].includes(typeof value) && value !== "")
        .map(([key, value]) => `• ${key}: ${value}`);

      const lines = [
        "📢 *Detail Channel*",
        "",
        `🆔 *ID:* ${id ?? "-"}`,
        name && `📛 *Nama:* ${name}`,
        f.handle && `🔖 *Username:* @${String(f.handle).replace(/^@/, "")}`,
        invite && `🔗 *Link:* https://whatsapp.com/channel/${invite}`,
        subs && `👥 *Pengikut:* ${subs}`,
        verified && `${verified === "VERIFIED" ? "✅" : "❎"} *Verifikasi:* ${verified === "VERIFIED" ? "Terverifikasi" : "Belum terverifikasi"}`,
        f.state && `📌 *Status:* ${f.state}`,
        created && `📅 *Dibuat:* ${created}`,
        reactions && `😀 *Reaksi:* ${reactions}`,
        f.mute && `🔕 *Mute:* ${f.mute}`,
        f.role && `🎭 *Peran kamu/bot:* ${f.role}`,
        ...(desc ? ["", `📝 *Deskripsi:*\n${truncate(desc, 900)}`] : []),
        ...(extra.length ? ["", "ℹ️ *Lainnya*", ...extra.slice(0, 12)] : []),
      ]
        .filter(Boolean)
        .join("\n");

      const picture = pictureUrl(meta);
      let sent = false;
      if (picture) sent = await ctx.reply({ image: { url: picture }, caption: lines }).then(() => true, () => false);
      if (!sent) await ctx.reply(lines, { preview: false });

      if (/\b(json|raw)\b/i.test(ctx.argsStr)) {
        await ctx.reply({ document: Buffer.from(JSON.stringify(meta, null, 2)), mimetype: "application/json", fileName: `channel-${String(id).split("@")[0]}.json` });
      }
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw new Error(`Gagal mengambil info channel: ${err.message || "tidak diketahui"}`);
    }
  },
});
