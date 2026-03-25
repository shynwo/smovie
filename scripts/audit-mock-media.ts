import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { MockMediaDataset } from "./types/media.js";

const BASE_DIR = process.cwd();
const DATASET_PATH = path.join(BASE_DIR, "data", "mockMedia.json");
const PUBLIC_DIR = path.join(BASE_DIR, "public");

function toAbsPublicPath(publicPath: string): string {
  const normalized = String(publicPath || "").trim().replace(/^\/+/, "").replace(/^public\//, "");
  return path.resolve(PUBLIC_DIR, normalized);
}

async function existsFile(filePath: string): Promise<boolean> {
  try {
    const s = await stat(filePath);
    return s.isFile();
  } catch {
    return false;
  }
}

function hasMojibake(value: string): boolean {
  return /Ã.|â€¦|â€™|Â./.test(value);
}

function mediaLabel(item: { id?: string; slug?: string; title?: string }): string {
  return `${item.id || "?"} (${item.slug || "?"} | ${item.title || "?"})`;
}

async function main(): Promise<void> {
  const raw = await readFile(DATASET_PATH, "utf8");
  const dataset = JSON.parse(raw) as MockMediaDataset;
  const items = Array.isArray(dataset.items) ? dataset.items : [];

  console.log(`[audit] items=${items.length} collections=${Array.isArray(dataset.collections) ? dataset.collections.length : 0}`);

  const idSeen = new Set<string>();
  const slugSeen = new Set<string>();
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const item of items) {
    const label = mediaLabel(item);
    if (!item.id) errors.push(`${label}: id manquant`);
    if (!item.tmdbId) errors.push(`${label}: tmdbId manquant`);
    if (!item.slug) errors.push(`${label}: slug manquant`);
    if (!item.type) errors.push(`${label}: type manquant`);
    if (!item.category) errors.push(`${label}: category manquante`);
    if (!item.title) errors.push(`${label}: title manquant`);
    if (!item.shortDescription) errors.push(`${label}: shortDescription manquante`);
    if (!item.longDescription) errors.push(`${label}: longDescription manquante`);
    if (!item.poster) errors.push(`${label}: poster manquant`);
    if (!item.heroBackground) errors.push(`${label}: heroBackground manquant`);
    if (!item.cardImage) errors.push(`${label}: cardImage manquant`);

    if (item.id) {
      if (idSeen.has(item.id)) errors.push(`${label}: id dupliqué`);
      idSeen.add(item.id);
    }
    if (item.slug) {
      if (slugSeen.has(item.slug)) errors.push(`${label}: slug dupliqué`);
      slugSeen.add(item.slug);
    }

    const textFields = [item.title, item.originalTitle, item.shortDescription, item.longDescription];
    if (textFields.some((value) => typeof value === "string" && hasMojibake(value))) {
      warnings.push(`${label}: texte potentiellement corrompu (mojibake détecté)`);
    }

    const imageFields = [
      { key: "poster", value: item.poster },
      { key: "backdrop", value: item.backdrop },
      { key: "heroBackground", value: item.heroBackground },
      { key: "cardImage", value: item.cardImage },
      { key: "logo", value: item.logo || "" },
      { key: "clearart", value: item.clearart || "" },
    ];

    for (const field of imageFields) {
      const v = String(field.value || "").trim();
      if (!v) continue;
      if (!v.startsWith("/library/")) {
        warnings.push(`${label}: ${field.key} n'est pas local (${v})`);
        continue;
      }
      const abs = toAbsPublicPath(v);
      if (!(await existsFile(abs))) {
        errors.push(`${label}: ${field.key} introuvable sur disque (${v})`);
      }
    }

    if ("seasons" in item && Array.isArray(item.seasons)) {
      for (const season of item.seasons) {
        if (!season.poster) warnings.push(`${label}: season ${season.seasonNumber} sans poster`);
        for (const ep of season.episodes || []) {
          if (!ep.title) warnings.push(`${label}: S${season.seasonNumber}E${ep.episodeNumber} sans titre`);
          if (ep.still) {
            const abs = toAbsPublicPath(ep.still);
            if (!(await existsFile(abs))) {
              errors.push(`${label}: still épisode introuvable (${ep.still})`);
            }
          }
        }
      }
    }
  }

  if (warnings.length) {
    console.log(`[audit] warnings=${warnings.length}`);
    for (const warning of warnings.slice(0, 40)) console.log(`  - ${warning}`);
    if (warnings.length > 40) console.log(`  ... ${warnings.length - 40} warning(s) supplémentaires`);
  } else {
    console.log("[audit] warnings=0");
  }

  if (errors.length) {
    console.log(`[audit] errors=${errors.length}`);
    for (const error of errors.slice(0, 80)) console.log(`  - ${error}`);
    if (errors.length > 80) console.log(`  ... ${errors.length - 80} erreur(s) supplémentaires`);
    process.exitCode = 1;
    return;
  }

  console.log("[audit] OK - dataset cohérent");
}

main().catch((error) => {
  console.error("[audit] fatal:", error);
  process.exitCode = 1;
});
