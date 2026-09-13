import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    function sync(event) {
      if (event.key !== 'theme-preference' && event.key !== null) return;
      const nextDark = event.newValue !== 'light';
      document.documentElement.classList.toggle('dark', nextDark);
      setDark(nextDark);
    }
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  function toggle() {
    const nextDark = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', nextDark);
    setDark(nextDark);
    // Private browsing can block storage; switching still works for this page.
    try { localStorage.setItem('theme-preference', nextDark ? 'dark' : 'light'); } catch {}
  }

  return <button type="button" className="icon-button theme-toggle" onClick={toggle}
    aria-label="Dark theme" aria-pressed={dark}
    title={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
    {dark ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
  </button>;
}
