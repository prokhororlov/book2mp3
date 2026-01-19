import React, { useState, useCallback, useEffect, ReactNode } from 'react';
import { I18nContext, getTranslations, getStoredLanguage, setStoredLanguage, defaultLanguage } from './index';
import { Language } from './types';

interface I18nProviderProps {
  children: ReactNode;
}

function getLanguageFromLocale(locale: string): Language {
  if (locale.startsWith('ru')) {
    return 'ru';
  }
  return defaultLanguage;
}

export function I18nProvider({ children }: I18nProviderProps) {
  const [language, setLanguageState] = useState<Language>(getStoredLanguage);
  const [initialized, setInitialized] = useState(false);

  // On first mount, check system locale via Electron if no language is stored
  useEffect(() => {
    const initLanguage = async () => {
      const stored = localStorage.getItem('voicecraft-language');
      if (!stored && window.electronAPI?.getSystemLocale) {
        try {
          const systemLocale = await window.electronAPI.getSystemLocale();
          const systemLang = getLanguageFromLocale(systemLocale);
          setLanguageState(systemLang);
          setStoredLanguage(systemLang);
        } catch (error) {
          console.error('Failed to get system locale:', error);
        }
      }
      setInitialized(true);
    };
    initLanguage();
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    setStoredLanguage(lang);
  }, []);

  const t = getTranslations(language);

  // Listen for language change from settings
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'voicecraft-language' && (e.newValue === 'en' || e.newValue === 'ru')) {
        setLanguageState(e.newValue);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Don't render children until language is initialized to avoid flash
  if (!initialized) {
    return null;
  }

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export default I18nProvider;
