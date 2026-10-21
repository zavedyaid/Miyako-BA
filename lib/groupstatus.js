import { generateMessageIDV2, prepareWAMessageMedia } from "#lib/baileys";
import { t as tl } from "#lib/i18n";

/*
 * Status grup (groupStatusMessageV2) untuk media: gambar, video, voice note.
 *
 * Kenapa tidak lewat sendMessage({ …, groupStatus: true })? Pesan media yang dibungkus groupStatusMessageV2 membuat
 * relayMessage Baileys gagal mengenali jenis medianya: atribut stanza `type` jadi "text" dan atribut `mediatype`
 * tidak dipasang, sehingga penerima melihat "You received a status update but your version of WhatsApp doesn't
 * support it" (gejala yang sama diperbaiki di fork Baileys lain). Di sini media diunggah sendiri, dibungkus manual,
 * dan ke relayMessage diberikan objek yang `audioMessage` / `imageMessage` / `videoMessage`-nya hanya terlihat lewat
 * prototype: detektor jenis media membacanya (→ type "media" + mediatype benar), sedangkan encoder protobuf yang
 * memakai hasOwnProperty tidak ikut mengirimnya — jadi tidak ada pesan ganda di chat grup.
 */
const BACKGROUND_ARGB = 0xff1f2c34; // latar voice status

export const buildGroupStatus = async (sock, { kind, buffer, mimetype, caption, seconds, ptt = false }) => {
  if (!["image", "video", "audio"].includes(kind)) throw new Error(tl("lb.groupstatus.groupstatus.1", { kind }));
  const field = `${kind}Message`;

  const prepared = await prepareWAMessageMedia(
    { [kind]: buffer, ...(mimetype && { mimetype }), ...(kind === "audio" && ptt && { ptt: true }), ...(seconds && { seconds }) },
    { upload: sock.waUploadToServer },
  );
  const inner = prepared?.[field];
  if (!inner) throw new Error(tl("lb.groupstatus.groupstatus.2"));

  if (mimetype) inner.mimetype = mimetype;
  if (kind === "audio") {
    inner.ptt = Boolean(ptt);
    inner.backgroundArgb = BACKGROUND_ARGB;
  } else if (caption) {
    inner.caption = caption;
  }
  if (seconds && kind !== "image") inner.seconds = seconds;

  const message = Object.create({ [field]: inner }); // petunjuk jenis media: hanya di prototype
  message.groupStatusMessageV2 = { message: { [field]: inner } };
  return message;
};

export const sendGroupStatusMedia = async (sock, chatId, options) => {
  const message = await buildGroupStatus(sock, options);
  const messageId = generateMessageIDV2(sock.user?.id);
  await sock.relayMessage(chatId, message, { messageId });
  return messageId;
};
