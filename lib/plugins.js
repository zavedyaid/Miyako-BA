import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import chokidar from "chokidar";
import { config } from "#lib/config";
import { logger } from "#lib/logger";

const ACCESS_KEYS = ["owner", "premium", "group", "private", "admin", "botAdmin"];

export const definePlugin = (spec) => {
  if (!spec || typeof spec.name !== "string" || !spec.name.trim()) {
    throw new TypeError("plugin: field `name` wajib berupa string");
  }
  if (typeof spec.run !== "function" && typeof spec.passive !== "function") {
    throw new TypeError(`plugin "${spec.name}": needs \`run\` or \`passive\``);
  }

  const plugin = {
    aliases: [],
    category: "general",
    description: "",
    usage: "",
    limit: 0,
    exp: 10,
    hidden: false,
    ...spec,
    access: { ...spec.access },
  };

  plugin.name = plugin.name.trim().toLowerCase();
  plugin.aliases = plugin.aliases.map((alias) => String(alias).toLowerCase());
  plugin.category = String(plugin.category).toLowerCase();

  for (const key of Object.keys(plugin.access)) {
    if (!ACCESS_KEYS.includes(key)) {
      throw new TypeError(`plugin "${plugin.name}": access.${key} tidak dikenal (valid: ${ACCESS_KEYS.join(", ")})`);
    }
  }
  return Object.freeze(plugin);
};

class Registry {
  #dir = path.resolve(config.paths.plugins);
  #commands = new Map();
  #files = new Map();
  #watcher = null;

  resolve(command) {
    return this.#commands.get(command)?.plugin ?? null;
  }

  get plugins() {
    return [...this.#files.values()].flat().filter((p) => typeof p.run === "function");
  }

  get passives() {
    return [...this.#files.values()].flat().filter((p) => typeof p.passive === "function");
  }

  get names() {
    return [...this.#commands.keys()];
  }

  // Hanya nama utama command (tanpa alias) — dipakai saran salah ketik & daftar menu.
  get primaryNames() {
    return [...new Set(this.plugins.map((p) => p.name))];
  }

  categories() {
    const map = new Map();
    for (const plugin of this.plugins) {
      if (plugin.hidden) continue;
      if (!map.has(plugin.category)) map.set(plugin.category, []);
      map.get(plugin.category).push(plugin);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return new Map([...map].sort(([a], [b]) => a.localeCompare(b)));
  }

  #walk(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return this.#walk(full);
      return entry.name.endsWith(".js") && !entry.name.startsWith("_") ? [full] : [];
    });
  }

  async load(file) {
    file = path.resolve(file);
    try {
      const mod = await import(`${pathToFileURL(file).href}?v=${Date.now()}`);
      const exported = [mod.default].flat().filter(Boolean);
      if (!exported.length) throw new Error("tidak ada `export default`");

      this.unload(file);
      const plugins = exported.map(definePlugin);

      for (const plugin of plugins) {
        if (typeof plugin.run !== "function") continue;
        for (const name of [plugin.name, ...plugin.aliases]) {
          const owner = this.#commands.get(name);
          if (owner && owner.file !== file) {
            logger.warn(`Command "${name}" conflicts with ${path.relative(this.#dir, owner.file)} — skipped`);
            continue;
          }
          this.#commands.set(name, { plugin, file });
        }
      }

      this.#files.set(file, plugins);
      return true;
    } catch (err) {
      const stale = /does not provide an export/.test(err.message);
      logger.error(
        `Plugin ${path.relative(this.#dir, file)}: ${err.message}` +
          (stale ? " → file lib/ lebih baru dari yang berjalan. Restart bot (Stop → Start), bukan hanya reload plugin." : ""),
      );
      return false;
    }
  }

  unload(file) {
    file = path.resolve(file);
    for (const [name, entry] of this.#commands) if (entry.file === file) this.#commands.delete(name);
    this.#files.delete(file);
  }

  async loadAll() {
    let failed = 0;
    for (const file of this.#walk(this.#dir)) if (!(await this.load(file))) failed++;

    const rows = [...this.categories()].map(([cat, list]) => `${cat.padEnd(12)} ${String(list.length).padStart(3)} command`);
    rows.push("", `Total ${this.plugins.length} command, ${this.passives.length} passive${failed ? `, ${failed} gagal` : ""}`);
    logger.box("PLUGIN LOADER", rows, logger.chalk.magenta);
  }

  watch() {
    if (this.#watcher) return;
    const valid = (file) => file.endsWith(".js") && !path.basename(file).startsWith("_");
    const rel = (file) => path.relative(this.#dir, file);

    this.#watcher = chokidar
      .watch(this.#dir, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 300 } })
      .on("add", async (f) => valid(f) && (await this.load(f)) && logger.plugin(`+ ${rel(f)}`))
      .on("change", async (f) => valid(f) && (await this.load(f)) && logger.plugin(`~ ${rel(f)}`))
      .on("unlink", (f) => {
        if (!valid(f)) return;
        this.unload(f);
        logger.plugin(`- ${rel(f)}`);
      });
  }
}

export const registry = new Registry();
