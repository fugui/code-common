import { useState, useEffect } from 'react';

export type Theme = 'dark' | 'light';

export function useTheme(defaultTheme: Theme = 'light') {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('code-theme') as Theme;
    if (saved === 'dark' || saved === 'light') return saved;
    return document.documentElement.classList.contains('light-theme') ? 'light' : defaultTheme;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light-theme');
    } else {
      root.classList.remove('light-theme');
    }
    localStorage.setItem('code-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  return { theme, setTheme, toggleTheme };
}
