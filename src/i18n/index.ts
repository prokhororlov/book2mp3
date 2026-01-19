import { createContext, useContext } from 'react';
import { Language, Translations, I18nContextType } from './types';
import { en } from './en';
import { ru } from './ru';

export const translations: Record<Language, Translations> = {
  en,
  ru,
};

export const defaultLanguage: Language = 'en';

export const I18nContext = createContext<I18nContextType | null>(null);

export function useI18n(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

export function getTranslations(language: Language): Translations {
  return translations[language] || translations[defaultLanguage];
}

export function getSystemLanguage(): Language {
  if (typeof navigator !== 'undefined') {
    const browserLang = navigator.language || (navigator as { userLanguage?: string }).userLanguage || '';
    if (browserLang.startsWith('ru')) {
      return 'ru';
    }
  }
  return defaultLanguage;
}

export function getStoredLanguage(): Language {
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = localStorage.getItem('voicecraft-language');
    if (stored === 'en' || stored === 'ru') {
      return stored;
    }
  }
  // Fall back to system language if nothing stored
  return getSystemLanguage();
}

export function setStoredLanguage(language: Language): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem('voicecraft-language', language);
  }
}

export * from './types';
