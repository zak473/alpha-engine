"use client";

/**
 * Never In Doubt — ThemeProvider (light only)
 *
 * Dark mode is intentionally disabled for now to keep the UI consistent with the
 * premium white/green sportsbook design system.
 */

import { createContext, useContext } from "react";

type Theme = "light";

interface ThemeContextValue {
  theme: Theme;
  // Kept for API compatibility; does nothing while dark mode is disabled.
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: "light", toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <ThemeContext.Provider value={{ theme: "light", toggle: () => {} }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
