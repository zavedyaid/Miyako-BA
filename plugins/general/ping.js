import os from "node:os";
import { definePlugin } from "#lib/plugins";
import { uptime } from "#lib/utils";

// Latensi ke server WhatsApp lewat ping IQ (tanpa pesan sementara). Gagal → selisih waktu pesan masuk.
const latency = async (sock, ctx) => {
  try {
    const start = performance.now();
    await Promise.race([
      sock.query({ tag: "iq", attrs: { to: "s.whatsapp.net", type: "get", xmlns: "w:p" }, content: [{ tag: "ping", attrs: {} }] }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000).unref?.()),
    ]);
    return Math.round(performance.now() - start);
  } catch {
    return Math.max(0, Date.now() - ctx.timestamp);
  }
};

export default definePlugin({
  name: "ping",
  aliases: ["p"],
  category: "general",
  description: "Cek kecepatan respons & status bot",
  async run({ ctx, sock, config }) {
    const rtt = await latency(sock, ctx);

    const report = [
      "*🏓 PONG*",
      `⚡ Respons : ${rtt} ms`,
      `💾 RAM      : ${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)} MB`,
      `⏱️ Uptime   : ${uptime(process.uptime())}`,
      `🖥️ Host     : ${os.platform()} · ${os.cpus().length} core`,
      `🟢 Node     : ${process.version}`,
    ].join("\n");

    await ctx.reply(report, { preview: { title: "🏓 PONG", body: `${rtt} ms · ${config.name}` } });
  },
});
