/**
 * Contrat unique vignette catalogue — aligné avec app.py (`_clean_card_image_type`) et `static/js/app.js`.
 * Fanart: moviethumb (films), tvthumb (séries / docs TV).
 */
export const CATALOG_CARD_IMAGE_TYPES = [
  "moviethumb",
  "tvthumb",
  "thumb",
  "banner",
  "backdrop",
  "poster",
  "fallback",
] as const;

export type CatalogCardImageType = (typeof CATALOG_CARD_IMAGE_TYPES)[number];

export const CATALOG_CARD_IMAGE_TYPE_SET = new Set<string>(CATALOG_CARD_IMAGE_TYPES);

export function normalizeCatalogCardImageType(raw: unknown): CatalogCardImageType {
  const key = String(raw == null || raw === "" ? "fallback" : raw).trim().toLowerCase();
  if (CATALOG_CARD_IMAGE_TYPE_SET.has(key)) {
    return key as CatalogCardImageType;
  }
  return "fallback";
}
