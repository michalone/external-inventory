import { createContext, useContext, type ReactNode } from "react";
import { getTranslator, type Translator } from "./index";

const I18nContext = createContext<Translator>(getTranslator("en"));

export function I18nProvider({
    locale,
    children,
}: {
    locale: string;
    children: ReactNode;
}) {
    return (
        <I18nContext.Provider value={getTranslator(locale)}>
            {children}
        </I18nContext.Provider>
    );
}

/**
 * Returns the translator function `t(key)` for the active locale.
 * Use it for every user-facing string instead of hardcoded text.
 */
export function useTranslation(): Translator {
    return useContext(I18nContext);
}
