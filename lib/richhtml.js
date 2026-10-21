import { generateMessageIDV2, generateWAMessage, prepareWAMessageMedia } from "#lib/baileys";
import { channelContext } from "#lib/channel";
import { getBuffer } from "#lib/utils";

/*
 * Kirim HTML interaktif (game / mini-app) sebagai "rich response" WhatsApp:
 *   1) kartu pratinjau link (gambar besar + judul + deskripsi), berlabel "diteruskan dari channel"
 *   2) pesan rich response dengan tombol "Lihat perincian" → sheet berisi HTML
 *
 *   sendHtmlApp(sock, chatId, { title, description, html, image, imageUrl, caption, hint })
 *     html      : string HTML (boleh <style>/<script>/<body>); dijalankan di sheet
 *     image     : Buffer thumbnail   |  imageUrl: link gambar (dipakai bila image kosong & juga sebagai teks pratinjau)
 *
 * Catatan: struktur rich response (embedded_screens / HtmlPrimitive) memakai format internal WhatsApp,
 * jadi bisa berubah sewaktu-waktu — pembungkus ini sengaja dibuat satu file agar mudah disesuaikan.
 */
const HTML_HOST = "https://nixel.dev";
const TRUSTED = ["nixel.dev"];
// Tebakan untuk bagian paste yang kepotong ([STRIPPED]); ganti kalau isi aslinya beda.
const BOT_JID = "867051314767696@bot";

export const buildUnifiedResponse = ({ title, html, url = HTML_HOST, trusted = TRUSTED }) => ({
  response_id: crypto.randomUUID(),
  sections: [{ view_model: { primitive: { text: `> ${title}`, __typename: "GenAIMarkdownTextUXPrimitive" }, __typename: "GenAISingleLayoutViewModel" } }],
  embedded_screens: [
    {
      title,
      content: [
        {
          __typename: "FOAIDNixelButtonSheets",
          tabs: [
            {
              id: "tab_0",
              tab_header: title,
              sections: [
                {
                  __typename: "GenAIUnifiedResponseSection",
                  view_model: {
                    __typename: "GenAISingleLayoutViewModel",
                    primitive: { __typename: "GenAIaeacdsnwHtmlPrimitive", payload: html, url, trusted_sources: trusted },
                  },
                },
              ],
              step_entries: [],
            },
          ],
        },
      ],
    },
  ],
});

export const sendHtmlApp = async (sock, chatId, { title, description = title, html, image, imageUrl, caption, hint, text, mentions, quoted, url, trusted } = {}) => {
  if (!html) throw new Error("richhtml: html kosong");
  const buffer = image ?? (imageUrl ? await getBuffer(imageUrl, { timeout: 30_000 }) : null);
  const label = hint ?? 'Klik "Lihat perincian" di bawah ini untuk start 🎮';

  // 1) kartu pratinjau
  if (buffer) {
    const { imageMessage: highQualityThumbnail } = await prepareWAMessageMedia({ image: buffer }, { upload: sock.waUploadToServer.bind(sock), mediaTypeOverride: "thumbnail-link" });
    const link = imageUrl ?? config_link();
    const preview = await generateWAMessage(
      chatId,
      { text: `${link}\n\n> ${title}\n\n${caption ?? label}` },
      {
        userJid: sock.authState.creds.me.id,
        upload: sock.waUploadToServer.bind(sock),
        quoted,
        getUrlInfo: async () => ({ "canonical-url": link, "matched-text": link, title, description, originalThumbnailUrl: link, jpegThumbnail: buffer, highQualityThumbnail }),
        messageId: generateMessageIDV2(sock.user?.id),
      },
    );
    const ext = preview.message?.extendedTextMessage;
    if (ext) ext.contextInfo = { ...(ext.contextInfo ?? {}), ...channelContext(), forwardingScore: 1, isForwarded: true };
    await sock.relayMessage(chatId, preview.message, { messageId: preview.key.id });
  }

  // 2) rich response + tombol "Lihat perincian"
  const data = Buffer.from(JSON.stringify(buildUnifiedResponse({ title, html, url, trusted }))).toString("base64");
  const message = {
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1,
          submessages: [{ messageType: 2, messageText: `> ${title}\n\n${text ?? label}` }],
          unifiedResponse: { data },
          contextInfo: { isForwarded: true, forwardingScore: 1, forwardOrigin: 4, forwardedAiBotMessageInfo: { botJid: BOT_JID }, ...(mentions?.length && { mentionedJid: mentions }) },
        },
      },
    },
  };
  const messageId = generateMessageIDV2(sock.user?.id);
  await sock.relayMessage(chatId, message, { messageId });
  return messageId; // dipakai pemanggil untuk menghapus / mengganti pesan ini
};

// Teks pratinjau butuh sebuah URL; pakai situs bot bila pemanggil tak memberi imageUrl.
const config_link = () => "https://zavedya.id";
