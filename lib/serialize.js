/*
 * Miyako - BA — serializer pesan
 * Author  : ZavedyaID
 * GitHub  : https://github.com/ZavedyaID/Miyako-BA
 * License : MIT
 */

import { downloadContentFromMessage, extractMessageContent, getContentType } from "#lib/baileys";
import { channelName } from "#lib/channel";
import { config } from "#lib/config";
import { sendInteractive } from "#lib/interactive";
import {
  Cache,
  MEDIA_KINDS,
  STATUS_JID,
  bare,
  bufferThumbnail,
  extractMentions,
  fakeQuoted,
  getBuffer,
  isGroupJid,
  numberOf,
  randomReplyThumbnail,
  resolveIdentity,
  sniff,
  toNumber,
} from "#lib/utils";

const SKIPPED = new Set([
  "protocolMessage",
  "senderKeyDistributionMessage",
  "reactionMessage",
  "pollUpdateMessage",
  "messageContextInfo",
]);

const textOf = (content) => {
  if (!content) return "";

  const flow = content.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (flow) {
    try {
      const parsed = JSON.parse(flow);
      if (typeof parsed === "string") return parsed;
      if (parsed?.id) return String(parsed.id);
    } catch {}
  }

  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    content.buttonsResponseMessage?.selectedButtonId ||
    content.listResponseMessage?.singleSelectReply?.selectedRowId ||
    content.templateButtonReplyMessage?.selectedId ||
    ""
  );
};

const downloadBuffer = async (content, kind) => {
  const chunks = [];
  for await (const chunk of await downloadContentFromMessage(content, kind)) chunks.push(chunk);
  return Buffer.concat(chunks);
};

const toPayload = (content, opts) => {
  if (typeof content === "string") return { text: content };

  if (Buffer.isBuffer(content) || content instanceof Uint8Array) {
    const buffer = Buffer.from(content);
    const sniffed = sniff(buffer);
    const kind = opts.type ?? sniffed.type;
    const payload = { [kind]: buffer };

    if (kind !== "sticker") payload.mimetype = opts.mimetype ?? sniffed.mime;
    if (opts.caption) payload.caption = opts.caption;
    if (opts.ptt !== undefined) payload.ptt = opts.ptt;
    if (kind === "document") payload.fileName = opts.fileName ?? `file.${sniffed.ext}`;
    else if (opts.fileName) payload.fileName = opts.fileName;
    return payload;
  }

  return content && typeof content === "object" ? { ...content } : { text: String(content ?? "") };
};

/*
 * Kartu pratinjau (gaya link preview) lewat externalAdReply bawaan @zavedyaid/baileys.
 * Kecil: gambar di kiri dari config/reply (acak tiap kirim). Penuh: large = true (gambar besar).
 * Judul = nama bot, isi = nama channel. Dipakai balasan teks biasa (usage, error, dll).
 */
const previewCard = ({ large = false, url, sourceUrl, ...extra } = {}) => ({
  title: config.name,
  body: channelName(),
  thumbnail: randomReplyThumbnail(large ? 640 : 300),
  largeThumbnail: large,
  url: url ?? sourceUrl ?? config.social?.github,
  ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined)),
});

/*
 * Foto profil pengirim → gambar kecil di kartu balasan ("WhatsApp Business • Status" + gambar di sebelahnya).
 * Di-cache 30 menit per orang. Tanpa foto / privat / gagal → gambar acak config/reply seperti sebelumnya.
 * Matikan: config.json → features.senderThumb = false
 */
const avatarCache = new Cache({ max: 300, ttl: 30 * 60_000 });
const senderThumb = async (sock, jid, width) => {
  const key = `${bare(jid)}:${width}`;
  const hit = avatarCache.get(key);
  if (hit !== undefined) return hit || undefined;
  try {
    const url = await Promise.race([sock.profilePictureUrl(jid, "image").catch(() => null), new Promise((r) => setTimeout(() => r(null), 3000))]);
    const thumb = url ? bufferThumbnail(await getBuffer(url, { timeout: 6000 }), width) : false;
    avatarCache.set(key, thumb);
    return thumb || undefined;
  } catch {
    return undefined; // gagal sementara: jangan di-cache, coba lagi di balasan berikutnya
  }
};

export async function buildContext(sock, msg) {
  const { key } = msg;
  const content = extractMessageContent(msg.message);
  if (!content) return null;

  const type = getContentType(content);
  if (!type || SKIPPED.has(type)) return null;

  const chatId = bare(key.remoteJid);
  const isGroup = isGroupJid(chatId);
  const isStatus = chatId === STATUS_JID;
  const fromMe = Boolean(key.fromMe);
  const grouped = isGroup || isStatus;

  const who = await resolveIdentity(
    sock,
    fromMe ? sock.user?.id : grouped ? key.participant : key.remoteJid,
    fromMe ? sock.user?.lid : grouped ? key.participantAlt : key.remoteJidAlt,
  );
  const senderId = who.id ?? bare(key.participant ?? key.remoteJid);

  const text = textOf(content);
  const body = text.trim();
  const prefixMatch = config.prefix.exec(body);
  let prefix = null;
  let command = null;
  let argsStr = "";

  if (prefixMatch) {
    const [, name = "", rest = ""] = /^(\S*)\s*([\s\S]*)$/.exec(body.slice(prefixMatch[0].length));
    if (/^[\p{L}\p{N}_$]+$/u.test(name)) {
      prefix = prefixMatch[0];
      command = name.toLowerCase();
      argsStr = rest.trim();
    }
  }

  const info = content[type]?.contextInfo;
  const mentionedJid = await Promise.all(
    (info?.mentionedJid ?? []).slice(0, 50).map(async (jid) => (await resolveIdentity(sock, jid)).id ?? jid),
  );

  const quoted = info?.quotedMessage ? extractMessageContent(info.quotedMessage) : null;
  const quotedType = quoted ? getContentType(quoted) : null;
  const quotedWho = info?.participant ? await resolveIdentity(sock, info.participant) : null;
  const mediaType = MEDIA_KINDS[type] ?? null;
  const quotedMediaType = MEDIA_KINDS[quotedType] ?? null;

  const ctx = {
    id: key.id,
    raw: msg,
    chatId,
    isGroup,
    isStatus,
    fromMe,
    senderId,
    senderPn: who.pn,
    senderLid: who.lid,
    senderNumber: numberOf(senderId),
    pushName: fromMe ? sock.user?.name || "Owner" : msg.pushName || "User",
    timestamp: toNumber(msg.messageTimestamp) * 1000,
    type,

    text,
    prefix,
    command,
    args: argsStr ? argsStr.split(/\s+/) : [],
    argsStr,
    isCmd: command !== null,

    mentionedJid,
    isQuoted: Boolean(quoted),
    quoted,
    quotedType,
    quotedText: textOf(quoted),
    quotedSender: quotedWho?.id ?? null,
    quotedKey: info?.stanzaId ? { remoteJid: chatId, id: info.stanzaId, participant: info.participant } : null,

    mimetype: content[type]?.mimetype ?? null,
    mediaType,
    isMedia: Boolean(mediaType),
    quotedMediaType,
    hasMedia: Boolean(mediaType || quotedMediaType),
  };

  ctx.hasArgs = ctx.args.length > 0;

  // Default: semua balasan me-reply kontak palsu "WhatsApp Business • Status".
  // { quoted: true } → reply pesan asli · { quoted: false } → tanpa reply · objek → pesan itu.
  const quotedOption = (option) =>
    option === false ? undefined : option === true ? msg : option ? option : fakeQuoted.contact(config.name);

  // Gambar kartu = foto profil pengirim perintah (kecuali preview.thumbnail diisi sendiri).
  const withSenderThumb = async (custom) => {
    if (custom.thumbnail !== undefined || config.features?.senderThumb === false) return custom;
    const thumbnail = await senderThumb(sock, senderId, custom.large ? 640 : 300);
    return thumbnail ? { ...custom, thumbnail } : custom;
  };

  ctx.reply = async (content, opts = {}) => {
    const payload = toPayload(content, opts);
    const mentions = opts.mentions ?? extractMentions(payload.text ?? payload.caption);
    if (mentions.length && !payload.mentions) payload.mentions = mentions;
    // Balasan teks → kartu pratinjau. Ubah isinya: { preview: { title, body, thumbnail, large } } (large: true = pratinjau penuh, gambar besar); matikan: { preview: false }.
    if (typeof payload.text === "string" && opts.preview !== false && !payload.externalAdReply) {
      payload.externalAdReply = previewCard(await withSenderThumb(opts.preview && opts.preview !== true ? opts.preview : {}));
    }
    return sock.sendMessage(chatId, payload, { quoted: quotedOption(opts.quoted) });
  };

  ctx.adReply = async (text, opts = {}) =>
    sock.sendMessage(
      chatId,
      {
        text,
        mentions: opts.mentions ?? extractMentions(text),
        externalAdReply: previewCard(await withSenderThumb({ large: opts.large ?? false, title: opts.title, body: opts.body, thumbnail: opts.thumbnail, url: opts.sourceUrl })),
      },
      { quoted: quotedOption(opts.quoted) },
    );

  // Kartu besar: gambar header + baris promo + teks + tombol. Tanpa `buttons` → tombol Website.
  ctx.card = (text, opts = {}) =>
    sendInteractive(sock, chatId, {
      text,
      buttons: opts.buttons ?? [{ type: "url", text: "🌐 Website", url: config.social?.website ?? "https://zavedya.id" }],
      mentions: opts.mentions ?? extractMentions(text),
      quoted: fakeQuoted.contact(config.name),
      ...opts,
    });

  ctx.react = (emoji) => sock.sendMessage(chatId, { react: { text: emoji, key } });
  ctx.delete = (target = key) => sock.sendMessage(chatId, { delete: target });
  ctx.edit = (sent, newText) => sock.sendMessage(chatId, { text: newText, edit: sent.key });
  ctx.typing = () => sock.sendPresenceUpdate("composing", chatId).catch(() => {});

  ctx.download = async () => {
    if (!mediaType) throw new Error("Pesan ini tidak berisi media.");
    return downloadBuffer(content[type], mediaType);
  };

  ctx.downloadQuoted = async () => {
    if (!quotedMediaType) throw new Error("Pesan yang di-reply tidak berisi media.");
    return downloadBuffer(quoted[quotedType], quotedMediaType);
  };

  ctx.fetchMedia = async () => {
    if (mediaType) return { buffer: await ctx.download(), kind: mediaType, mimetype: ctx.mimetype };
    if (!quotedMediaType) return null;
    return {
      buffer: await ctx.downloadQuoted(),
      kind: quotedMediaType,
      mimetype: quoted[quotedType]?.mimetype ?? null,
    };
  };

  return ctx;
}
