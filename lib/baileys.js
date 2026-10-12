/*
 * Satu pintu ke library Baileys. Ganti package cukup di sini + package.json.
 * Memakai @zavedyaid/baileys (fork dengan pesan interaktif bawaan).
 * Namespace import dipakai supaya aman untuk build ESM maupun CJS.
 */
import * as ns from "@zavedyaid/baileys";

const def = ns.default;
const pool = def && (typeof def === "object" || typeof def === "function") ? def : {};
const get = (name) => ns[name] ?? pool[name];

export const makeWASocket = get("makeWASocket") ?? (typeof def === "function" ? def : undefined);
export const Browsers = get("Browsers");
export const DisconnectReason = get("DisconnectReason");
export const fetchLatestBaileysVersion = get("fetchLatestBaileysVersion");
export const makeCacheableSignalKeyStore = get("makeCacheableSignalKeyStore");
export const useMultiFileAuthState = get("useMultiFileAuthState");
export const downloadContentFromMessage = get("downloadContentFromMessage");
export const extractMessageContent = get("extractMessageContent");
export const getContentType = get("getContentType");
export const generateMessageIDV2 = get("generateMessageIDV2");
export const proto = get("proto");
