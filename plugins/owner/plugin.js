import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { definePlugin } from "#lib/plugins";
import { config } from "#lib/config";
import { truncate } from "#lib/utils";

/*
 * Kelola plugin langsung dari WhatsApp (khusus owner):
 *   .addplugin / .sf <nama | kategori/nama>   (reply kode, kirim file .js, atau tulis kode setelah nama)
 *       → simpan plugin baru ATAU perbarui yang sudah ada. Langsung aktif (hot-reload).
 *   .getplugin <nama>   → kirim kode plugin sebagai file
 *   .delplugin <nama>   → hapus plugin (dibackup dulu)
 *   .listplugin         → daftar file plugin
 *
 * Aman-aman saja: sintaks dicek dulu (node --check), plugin yang gagal dimuat dikembalikan ke versi lama,
 * dan versi sebelumnya selalu dicadangkan di database/plugin-backup/.
 */
const run = promisify(execFile);
const ROOT = path.resolve(config.paths.plugins);
const BACKUP = path.join(config.paths.database, "plugin-backup");
const DEFAULT_CATEGORY = "custom";
const MAX_BYTES = 300 * 1024;
const SELF = path.join(ROOT, "owner", "plugin.js"); // manajer ini sendiri tidak boleh ditimpa / dihapus lewat bot
const SLUG = /^[a-z0-9][a-z0-9_-]{0,40}$/i;

const walk = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? walk(full) : e.name.endsWith(".js") ? [full] : [];
      })
    : [];

const rel = (file) => path.relative(ROOT, file).replaceAll(path.sep, "/");

// "nama" | "kategori/nama" (.js opsional) → { category, name } atau null
const parseRef = (value) => {
  const parts = String(value ?? "").replace(/\.js$/i, "").split("/").filter(Boolean);
  if (parts.length < 1 || parts.length > 2 || !parts.every((p) => SLUG.test(p))) return null;
  return parts.length === 2 ? { category: parts[0].toLowerCase(), name: parts[1] } : { category: null, name: parts[0] };
};

// Cari file yang ada: "kategori/nama" persis, atau "nama" di kategori mana pun.
const locate = (ref) => {
  const files = walk(ROOT);
  if (ref.category) return files.find((f) => rel(f).toLowerCase() === `${ref.category}/${ref.name}.js`.toLowerCase());
  return files.find((f) => path.basename(f, ".js").toLowerCase() === ref.name.toLowerCase());
};

const backup = (file) => {
  fs.mkdirSync(BACKUP, { recursive: true });
  const target = path.join(BACKUP, `${rel(file).replaceAll("/", "__")}.${Date.now()}.bak`);
  fs.copyFileSync(file, target);
  return target;
};

const stripFences = (code) =>
  code
    .replace(/^\uFEFF/, "")
    .replace(/^\s*```[a-zA-Z]*\s*\n/, "")
    .replace(/\n```\s*$/, "")
    .replace(/\r\n/g, "\n")
    .trim();

// Ambil kode: file .js yang dikirim / di-reply → teks setelah nama → teks pesan yang di-reply
const readSource = async (ctx, inline) => {
  const media = ctx.hasMedia ? await ctx.fetchMedia().catch(() => null) : null;
  if (media?.kind === "document") return stripFences(media.buffer.toString("utf8"));
  if (inline.trim()) return stripFences(inline);
  return ctx.quotedText ? stripFences(ctx.quotedText) : "";
};

const checkSyntax = async (code) => {
  fs.mkdirSync(config.paths.tmp, { recursive: true });
  const file = path.join(config.paths.tmp, `check-${Date.now()}.mjs`);
  fs.writeFileSync(file, code);
  try {
    await run(process.execPath, ["--check", file], { timeout: 15_000 });
    return null;
  } catch (err) {
    return String(err.stderr || err.message).replaceAll(file, "plugin.js").trim();
  } finally {
    fs.rmSync(file, { force: true });
  }
};

const save = definePlugin({
  name: "addplugin",
  aliases: ["sf", "saveplugin", "ap"],
  category: "owner",
  description: "Simpan / perbarui plugin dari kode (reply kode atau kirim file .js)",
  usage: "addplugin <nama | kategori/nama>",
  access: { owner: true },
  async run({ ctx, registry }) {
    const match = ctx.argsStr.match(/^(\S+)(?:\s+([\s\S]*))?$/);
    const ref = match ? parseRef(match[1]) : null;
    if (!ref) {
      return ctx.reply(
        [
          "❌ Tulis nama plugin.",
          `• *${ctx.prefix}addplugin halo* (reply kode / kirim file .js)`,
          `• *${ctx.prefix}addplugin tools/halo* → ke folder plugins/tools/`,
          `• Plugin yang sudah ada akan *diperbarui*; yang baru masuk ke plugins/${DEFAULT_CATEGORY}/ bila folder tidak disebut.`,
          "Nama: huruf, angka, - atau _ saja.",
        ].join("\n"),
      );
    }

    const code = await readSource(ctx, match[2] ?? "");
    if (!code) return ctx.reply("❌ Kodenya mana? Reply pesan berisi kode, kirim file .js, atau tulis kode setelah nama.");
    if (Buffer.byteLength(code) > MAX_BYTES) return ctx.reply(`❌ Kode terlalu besar (maks ${MAX_BYTES / 1024} KB).`);
    if (!/export\s+default/.test(code)) return ctx.reply("❌ Plugin harus punya `export default definePlugin({ … })`.");

    const existing = locate(ref);
    const file = existing ?? path.join(ROOT, (ref.category ?? DEFAULT_CATEGORY).toLowerCase(), `${ref.name}.js`);
    if (path.resolve(file) === SELF) return ctx.reply("🔒 Plugin manajer ini tidak bisa ditimpa lewat bot. Ganti manual lewat file / .exec.");
    if (!path.resolve(file).startsWith(ROOT + path.sep)) return ctx.reply("❌ Lokasi tidak valid.");

    const problem = await checkSyntax(code);
    if (problem) return ctx.reply(`❌ Sintaks error, plugin tidak disimpan:\n\`\`\`\n${truncate(problem, 1500)}\n\`\`\``);

    const previous = existing ? fs.readFileSync(file, "utf8") : null;
    if (existing) backup(file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${code}\n`);

    // Muat sekarang supaya kegagalan impor langsung ketahuan (watcher memuat ulang juga, tidak masalah).
    const loaded = await registry.load(file);
    if (!loaded) {
      if (previous !== null) {
        fs.writeFileSync(file, previous);
        await registry.load(file);
      } else {
        fs.rmSync(file, { force: true });
        registry.unload(file);
      }
      return ctx.reply(`❌ Plugin gagal dimuat (cek log konsol untuk detail).\n${previous !== null ? "↩️ Dikembalikan ke versi sebelumnya." : "🗑️ File tidak disimpan."}`);
    }

    const names = registry.plugins.length;
    await ctx.reply(`${existing ? "♻️ Diperbarui" : "✅ Ditambahkan"}: *plugins/${rel(file)}*\n📦 Total command aktif: ${names}`);
  },
});

const get = definePlugin({
  name: "getplugin",
  aliases: ["gp"],
  category: "owner",
  description: "Kirim kode plugin sebagai file",
  usage: "getplugin <nama | kategori/nama>",
  access: { owner: true },
  async run({ ctx }) {
    const ref = parseRef(ctx.args[0]);
    if (!ref) return ctx.reply(`❌ Contoh: *${ctx.prefix}getplugin tiktok*`);
    const file = locate(ref);
    if (!file) return ctx.reply(`❌ Plugin *${ctx.args[0]}* tidak ditemukan. Lihat *${ctx.prefix}listplugin*.`);
    await ctx.reply({ document: fs.readFileSync(file), mimetype: "text/javascript", fileName: path.basename(file), caption: `📄 plugins/${rel(file)}` });
  },
});

const del = definePlugin({
  name: "delplugin",
  aliases: ["dp", "rmplugin"],
  category: "owner",
  description: "Hapus plugin (dicadangkan dulu)",
  usage: "delplugin <nama | kategori/nama>",
  access: { owner: true },
  async run({ ctx, registry }) {
    const ref = parseRef(ctx.args[0]);
    if (!ref) return ctx.reply(`❌ Contoh: *${ctx.prefix}delplugin halo*`);
    const file = locate(ref);
    if (!file) return ctx.reply(`❌ Plugin *${ctx.args[0]}* tidak ditemukan. Lihat *${ctx.prefix}listplugin*.`);
    if (path.resolve(file) === SELF) return ctx.reply("🔒 Plugin manajer ini tidak bisa dihapus lewat bot.");

    backup(file);
    fs.rmSync(file, { force: true });
    registry.unload(file);
    await ctx.reply(`🗑️ Dihapus: *plugins/${rel(file)}*\n💾 Cadangan ada di database/plugin-backup/`);
  },
});

const list = definePlugin({
  name: "listplugin",
  aliases: ["lp", "plugins"],
  category: "owner",
  description: "Daftar file plugin",
  usage: "listplugin [kategori]",
  access: { owner: true },
  async run({ ctx }) {
    const only = ctx.args[0]?.toLowerCase();
    const byDir = new Map();
    for (const file of walk(ROOT)) {
      const [dir, ...rest] = rel(file).split("/");
      if (only && dir.toLowerCase() !== only) continue;
      if (!byDir.has(dir)) byDir.set(dir, []);
      byDir.get(dir).push(rest.join("/").replace(/\.js$/, ""));
    }
    if (!byDir.size) return ctx.reply("❌ Tidak ada plugin yang cocok.");

    const lines = [...byDir].sort(([a], [b]) => a.localeCompare(b)).map(([dir, names]) => `📁 *${dir}* (${names.length})\n${names.sort().join(", ")}`);
    await ctx.reply(truncate(lines.join("\n\n"), 3500), { preview: false });
  },
});

export default [save, get, del, list];
