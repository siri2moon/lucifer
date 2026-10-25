/**
 * UI languages. To add one, add a line here and a dictionary in `i18n.ts`
 * (TypeScript flags any missing key).
 */
export const LANGS = [
  { id: "en", name: "English", flag: "🇬🇧" },
  { id: "vi", name: "Tiếng Việt", flag: "🇻🇳" },
] as const;

export type Lang = (typeof LANGS)[number]["id"];
export const DEFAULT_LANG: Lang = "en";

export function isLang(value: unknown): value is Lang {
  return LANGS.some((l) => l.id === value);
}

/**
 * The first of the browser's preferred languages that the UI supports, matched on the primary tag
 * ("vi-VN" → "vi"); English when none matches.
 */
export function preferredLang(languages: readonly string[]): Lang {
  for (const tag of languages) {
    const primary = tag.split("-")[0]?.toLowerCase();
    if (isLang(primary)) return primary;
  }
  return DEFAULT_LANG;
}
