import { readFileSync } from "node:fs";
import path from "node:path";
import { config } from "#lib/config";

/*
 * Mesin game bersama (config/games/engine/*.js). Tiap berkas berisi SATU ekspresi JS (IIFE) yang dipakai dua kali:
 *   • di sheet WhatsApp  → disisipkan ke HTML lewat placeholder ENGINE
 *   • di bot (Node)      → dijalankan untuk memutar ulang permainan & menghitung hasil sendiri (tidak percaya klien)
 */
const dir = () => path.join(config.paths.config, "games", "engine");
const cache = new Map();

export const engineSource = (name) => {
  if (!cache.has(name)) cache.set(name, readFileSync(path.join(dir(), `${name}.js`), "utf8"));
  return cache.get(name);
};
export const engine = (name) => (0, eval)(engineSource(name));
export const enginePath = (name) => path.join(dir(), `${name}.js`);
