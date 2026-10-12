import { config } from "#lib/config";

/*
 * Semua pesan keluar ditandai "diteruskan dari channel".
 * Diatur di config.json:
 *   newsletterJid → JID channel (…@newsletter)
 *   ChannelName   → nama channel yang tampil di label "Diteruskan dari …"
 *   channel       → link channel (dipakai sebagai tombol/tautan, harus URL)
 */

export const channelName = () => config.ChannelName ?? config.name;

export const channelUrl = () => (/^https?:\/\//i.test(config.channel ?? "") ? config.channel : null);

export const channelContext = () =>
  config.newsletterJid
    ? {
        isForwarded: true,
        forwardingScore: 1,
        forwardedNewsletterMessageInfo: {
          newsletterJid: config.newsletterJid,
          newsletterName: channelName(),
          serverMessageId: -1,
        },
      }
    : {};

const CARRIES_CONTEXT = ["text", "image", "video", "audio", "document", "sticker", "contacts", "location"];
const SKIP = ["react", "delete", "edit", "forward", "poll", "groupInvite", "pin", "disappearingMessagesInChat"];

// Sisipkan label channel ke contextInfo; field yang sudah diisi pemanggil tidak ditimpa.
export const withChannel = (content) => {
  if (!content || typeof content !== "object") return content;
  if (SKIP.some((key) => key in content)) return content;
  if (!CARRIES_CONTEXT.some((key) => key in content)) return content;
  return { ...content, contextInfo: { ...channelContext(), ...content.contextInfo } };
};

// Bungkus sock.sendMessage sekali di boot — semua plugin, event, dan fallback ikut otomatis.
export const patchChannel = (sock) => {
  const send = sock.sendMessage.bind(sock);
  sock.sendMessage = (jid, content, options) => {
    const status = typeof jid === "string" && jid.endsWith("@broadcast");
    return send(jid, status ? content : withChannel(content), options);
  };
  return sock;
};
