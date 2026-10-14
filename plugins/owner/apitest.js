import { definePlugin } from "#lib/plugins";
import { api } from "#lib/api";
import { config } from "#lib/config";
import { truncate } from "#lib/utils";

/*
 * Uji API Zavedya (khusus owner).
 *   .apitest                  → cek semua route ringan dengan contoh parameter
 *   .apitest <kategori>       → hanya satu kategori: ai | downloader | search | stalker | tools | wiki
 *   .apitest all              → termasuk route berat (generate gambar, edit gambar)
 *   .apitest <path> [k=v …]   → uji satu route dengan parameter sendiri, tampilkan detail respons
 *       contoh: .apitest /downloader/tiktok url=https://vt.tiktok.com/xxxx
 *       tambah  post  di depan untuk POST:  .apitest post /ai/nanobanana prompt=anime imageUrl=https://…
 *
 * Arti ikon: ✅ hidup & sukses • ⚠️ hidup tapi menolak contoh input (4xx / status error) • ❌ mati / error server / timeout
 */
const URLS = {
  tiktok: "https://www.tiktok.com/@tiktok/video/7106594312292453675",
  youtube: "https://youtu.be/dQw4w9WgXcQ",
  spotify: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
  soundcloud: "https://soundcloud.com/forss/flickermood",
  pinterest: "https://www.pinterest.com/pin/99360735500167749/",
  dailymotion: "https://www.dailymotion.com/video/x8r9a2c",
  likee: "https://likee.video/@likee_international/video/7000000000000000000",
  rednote: "https://www.xiaohongshu.com/explore/64a0000000000000000000",
  mediafire: "https://www.mediafire.com/file/xxxxxxxxxxxx/test.zip/file",
  terabox: "https://terabox.com/s/1xxxxxxxxxxxxxxx",
};
const AI = ["agnes", "claude", "coding", "deepseek", "free", "gemini", "glm", "gpt", "hunyuan", "kimi", "minimax", "qwen", "sonus", "stepfun"];

// [metode, path, parameter, berat?]
const ROUTES = [
  ...AI.map((name) => ["GET", `/ai/${name}`, { prompt: "halo, balas satu kata saja", ...(name === "gemini" && { model: "gemini-3.6-flash" }) }]),
  ["GET", "/ai/models", {}],
  ["GET", "/ai/flux-image", { prompt: "a white rabbit" }, true],
  ["POST", "/ai/nanobanana", { prompt: "make it anime", imageUrl: "https://placehold.co/256.png" }, true],
  ...Object.entries(URLS).map(([name, url]) => ["GET", `/downloader/${name}`, { url }]),
  ["GET", "/search/dafont", { query: "pixel" }],
  ["GET", "/search/dramabox", { query: "love" }],
  ["GET", "/search/google-news", { query: "teknologi" }],
  ["GET", "/search/konachan", { query: "rabbit" }],
  ["GET", "/search/lyrics", { artist: "Adele", title: "Hello" }],
  ["GET", "/search/pinterest", { query: "aesthetic", limit: 3 }],
  ["GET", "/search/soundcloud", { query: "lofi" }],
  ["GET", "/search/yts", { query: "lofi", limit: 3 }],
  ["GET", "/stalker/github", { username: "octocat" }],
  ["GET", "/stalker/instagram", { username: "instagram" }],
  ["GET", "/stalker/tiktok", { username: "tiktok" }],
  ["GET", "/stalker/twitter", { username: "x" }],
  ["GET", "/stalker/youtube", { username: "YouTube" }],
  ["GET", "/tools/converter", { url: "https://placehold.co/256.png", format: "jpg" }, true],
  ["GET", "/tools/removebg", { imageUrl: "https://placehold.co/256.png" }, true],
  ["GET", "/tools/tempmail", {}],
  ["GET", "/wiki/honor-of-kings", { name: "Lian Po" }],
  ["GET", "/wiki/wuthering-waves", { name: "Jiyan" }],
];

const verdict = (r) => {
  const status = r.data?.status;
  const message = String(r.data?.message ?? r.data?.error ?? r.error ?? "");
  if (r.status === 0) return { icon: "❌", note: r.error === "timeout" ? "timeout" : `tidak terhubung (${truncate(r.error, 40)})` };
  if (r.ok && (!status || status === "success")) return { icon: "✅", note: "" };
  if (r.status >= 500) return { icon: "❌", note: `HTTP ${r.status}${message ? ` — ${truncate(message, 50)}` : ""}` };
  if (/model|unavailable|tidak tersedia|maintenance/i.test(message)) return { icon: "❌", note: truncate(message, 60) };
  return { icon: "⚠️", note: `HTTP ${r.status}${message ? ` — ${truncate(message, 50)}` : ""}` };
};

const parseParams = (tokens) => {
  const params = {};
  for (const token of tokens) {
    const at = token.indexOf("=");
    if (at > 0) params[token.slice(0, at)] = token.slice(at + 1);
  }
  return params;
};

const pool = async (items, size, worker) => {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await worker(items[i], i);
      }
    }),
  );
  return results;
};

export default definePlugin({
  name: "apitest",
  aliases: ["testapi", "cekapi"],
  category: "owner",
  description: "Uji semua route API Zavedya (atau satu route)",
  usage: "apitest [kategori | all | <path> k=v …]",
  access: { owner: true },
  async run({ ctx }) {
    const [first = "", ...rest] = ctx.args;
    const lower = first.toLowerCase();

    // ── satu route, detail lengkap ──
    const post = lower === "post";
    const pathArg = post ? rest[0] : first;
    if (pathArg?.startsWith("/")) {
      const params = parseParams(post ? rest.slice(1) : rest);
      ctx.react("⏳");
      const r = await api.raw(post ? "POST" : "GET", pathArg, { ...(post ? { body: params } : { params }), timeout: 60_000 });
      const v = verdict(r);
      const body = r.data ? JSON.stringify(r.data, null, 2) : r.text || r.error || "(kosong)";
      ctx.react(v.icon === "✅" ? "✅" : "❌");
      return ctx.reply(
        [`${v.icon} *${post ? "POST" : "GET"} ${pathArg}*`, `HTTP ${r.status || "-"} • ${r.ms} ms • ${r.contentType.split(";")[0] || "-"}`, "", "```", truncate(body, 2500), "```"].join("\n"),
        { preview: false },
      );
    }

    // ── daftar route ──
    const categories = [...new Set(ROUTES.map(([, path]) => path.split("/")[1]))];
    const all = lower === "all";
    if (first && !all && !categories.includes(lower)) {
      return ctx.reply(`❌ Kategori tidak dikenal.\nPilihan: ${categories.join(", ")}, all\nAtau uji satu route: *${ctx.prefix}apitest /downloader/tiktok url=https://…*`);
    }
    const selected = ROUTES.filter(([, path, , heavy]) => (all || !heavy) && (!first || all || path.split("/")[1] === lower));

    ctx.react("⏳");
    const base = String(config.api?.baseUrl ?? "https://api.zavedya.id");
    await ctx.reply(`🧪 Menguji *${selected.length}* route di ${base.replace(/^https?:\/\//, "")}…\n_Bisa 30–60 detik._`, { preview: false });

    const results = await pool(selected, 5, async ([method, path, params]) => {
      const r = await api.raw(method, path, { ...(method === "POST" ? { body: params } : { params }), timeout: 25_000 });
      return { method, path, r, v: verdict(r) };
    });

    const count = (icon) => results.filter((x) => x.v.icon === icon).length;
    const slowest = [...results].sort((a, b) => b.r.ms - a.r.ms)[0];
    const lines = results.map(({ path, r, v }) => `${v.icon} ${path} — ${r.ms}ms${v.note ? ` • ${v.note}` : ""}`);

    ctx.react(count("❌") ? "❌" : "✅");
    await ctx.reply(
      [`🧪 *Hasil API Test*`, `✅ ${count("✅")} • ⚠️ ${count("⚠️")} • ❌ ${count("❌")} (dari ${results.length})`, slowest && `🐢 Terlambat: ${slowest.path} (${slowest.r.ms}ms)`, "", ...lines, "", `⚠️ = hidup tapi menolak contoh input. Uji dengan input asli: ${ctx.prefix}apitest /path k=v`]
        .filter((l) => l !== undefined && l !== false)
        .join("\n"),
      { preview: false },
    );
  },
});
