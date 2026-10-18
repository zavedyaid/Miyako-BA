import { channelContext, channelName } from "#lib/channel";
import { config } from "#lib/config";
import { randomReplyThumbnail } from "#lib/utils";

/*
 * Kartu pratinjau (gaya link preview) lewat externalAdReply bawaan @zavedyaid/baileys.
 * Kecil: gambar di kiri = gambar ACAK dari config/reply (berubah tiap kirim). Penuh: large = true (gambar besar).
 * Judul = nama bot, isi = nama channel. Dipakai balasan teks biasa (usage, error, dll).
 */
export const previewCard = ({ large = false, url, sourceUrl, ...extra } = {}) => ({
  title: config.name,
  body: channelName(),
  thumbnail: randomReplyThumbnail(large ? 640 : 300),
  largeThumbnail: large,
  url: url ?? sourceUrl ?? config.social?.github,
  ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined)),
});

/*
 * Payload untuk MENGEDIT pesan teks tanpa kehilangan label "diteruskan dari channel" + kartu pratinjau
 * (WhatsApp membuang keduanya kalau pesan hasil edit tidak membawanya lagi).
 */
export const editPayload = (key, text, extra = {}) => ({
  text,
  edit: key,
  contextInfo: channelContext(),
  externalAdReply: previewCard(),
  ...extra,
});
