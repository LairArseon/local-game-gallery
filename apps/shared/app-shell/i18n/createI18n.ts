import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

type I18nResources = {
  enCommon: unknown;
  esCommon: unknown;
};

export function createI18n({ enCommon, esCommon }: I18nResources) {
  const initialLanguage = navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en';

  void i18n
    .use(initReactI18next)
    .init({
      resources: {
        en: { common: enCommon },
        es: { common: esCommon },
      },
      lng: initialLanguage,
      fallbackLng: 'en',
      defaultNS: 'common',
      interpolation: {
        escapeValue: false,
      },
    });

  return i18n;
}
