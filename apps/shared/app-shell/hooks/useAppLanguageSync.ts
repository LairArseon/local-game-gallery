/**
 * Sync i18n runtime language with persisted app config language.
 */
import { useEffect } from 'react';

type I18nLike = {
  language: string;
  changeLanguage: (language: string) => Promise<unknown>;
};

export function useAppLanguageSync(language: string | undefined, i18n: I18nLike) {
  useEffect(() => {
    if (!language) {
      return;
    }

    if (i18n.language.toLowerCase().startsWith(language)) {
      return;
    }

    void i18n.changeLanguage(language);
  }, [language, i18n]);
}
