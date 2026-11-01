'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const Ctx = createContext({ theme: 'system', setTheme: () => {} });

function apply(theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState('system');
  useEffect(() => {
    let t = 'system';
    try {
      t = localStorage.getItem('ft_theme') || 'system';
    } catch {
      /* ignore */
    }
    setThemeState(t);
    apply(t);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply(localStorage.getItem('ft_theme') || 'system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const setTheme = useCallback((t) => {
    try {
      localStorage.setItem('ft_theme', t);
    } catch {
      /* ignore */
    }
    setThemeState(t);
    apply(t);
  }, []);
  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>;
}
export const useTheme = () => useContext(Ctx);

// Inline script to set the theme class before first paint (avoids a flash).
export const themeScript = `(function(){try{var t=localStorage.getItem('ft_theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}})()`;
