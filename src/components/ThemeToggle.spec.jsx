import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import ThemeToggle from './ThemeToggle';

const boot = readFileSync('index.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function initializeTheme() { new Function(boot)(); }

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

describe('theme preference', () => {
  it.each([[null, true], ['dark', true], ['light', false], ['invalid', true]])(
    'initializes stored preference %s before React', (stored, expected) => {
      if (stored !== null) localStorage.setItem('theme-preference', stored);
      initializeTheme();
      expect(document.documentElement.classList.contains('dark')).toBe(expected);
    },
  );

  it('toggles, persists, and restores light on the next page load', () => {
    initializeTheme();
    render(<ThemeToggle />);
    const toggle = screen.getByRole('button', { name: 'Dark theme' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(localStorage.getItem('theme-preference')).toBe('light');
    document.documentElement.classList.add('dark');
    initializeTheme();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    fireEvent.click(toggle);
    expect(localStorage.getItem('theme-preference')).toBe('dark');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('still starts dark and switches when browser storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
    expect(initializeTheme).not.toThrow();
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Dark theme' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('reflects preferences changed or cleared in another tab', () => {
    initializeTheme();
    render(<ThemeToggle />);
    fireEvent(window, new StorageEvent('storage', { key: 'theme-preference', newValue: 'light' }));
    expect(screen.getByRole('button', { name: 'Dark theme' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent(window, new StorageEvent('storage', { key: null, newValue: null }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
