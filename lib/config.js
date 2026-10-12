import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const raw = JSON.parse(readFileSync(path.join(root, "config/config.json"), "utf8"));
const digits = (value) => String(value ?? "").replace(/\D/g, "");

export const config = {
  ...raw,
  prefix: new RegExp(raw.prefix ?? "^[.!/]"),
  owners: new Set((raw.ownerNumbers ?? []).map(digits).filter(Boolean)),
  ownerLids: new Set((raw.ownerLids ?? []).map(digits).filter(Boolean)),
  behavior: { staleAfterSeconds: 120, ...raw.behavior },
  paths: {
    root,
    config: path.join(root, "config"),
    session: path.join(root, "session"),
    database: path.join(root, "database"),
    tmp: path.join(root, "tmp"),
    plugins: path.join(root, "plugins"),
  },
};

export const isOwnerIdentity = ({ pn, lid } = {}) =>
  Boolean(
    (pn && config.owners.has(digits(pn.split("@")[0]))) ||
      (lid && config.ownerLids.has(digits(lid.split("@")[0]))),
  );
