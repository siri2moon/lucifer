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
