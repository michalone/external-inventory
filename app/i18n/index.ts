import en from "./en.json";
import cs from "./cs.json";

export type Messages = Record<string, string>;
export type Translator = (key: string, fallback?: string) => string;

export const defaultLocale = "en";

const dictionaries: Record<string, Messages> = { en, cs };

export const supportedLocales = Object.keys(dictionaries);

/**
 * Resolve a raw locale string (e.g. "cs-CZ", "en-US") to a supported locale.
 * Falls back to the default locale when the language is not supported.
 */
export function resolveLocale(locale?: string | null): string {
    if (!locale) return defaultLocale;
    const short = locale.toLowerCase().split("-")[0];
    return dictionaries[short] ? short : defaultLocale;
}

/**
 * Build a translator for the given locale. Missing keys fall back to the
 * default-locale value, then to the provided fallback, then to the key itself.
 */
export function getTranslator(locale?: string | null): Translator {
    const resolved = resolveLocale(locale);
    const dict = dictionaries[resolved] ?? dictionaries[defaultLocale];
    const fallbackDict = dictionaries[defaultLocale];
    return (key, fallback) => dict[key] ?? fallbackDict[key] ?? fallback ?? key;
}
