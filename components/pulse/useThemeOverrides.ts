"use client";

import { useEffect } from "react";
import {
  PULSE_ACCENT_DEFAULT_HEX,
  PULSE_ACCENT_HIGHLIGHT_DEFAULT_HEX,
  PULSE_ACCENT_SECONDARY_DEFAULT_HEX,
  setDomainHueOverrides,
} from "@/lib/pulse";

function applyTheme(theme: DesktopThemeOverrides | undefined) {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  root.setProperty("--pulse-accent", theme?.accentPrimary || PULSE_ACCENT_DEFAULT_HEX);
  root.setProperty("--pulse-accent-secondary", theme?.accentSecondary || PULSE_ACCENT_SECONDARY_DEFAULT_HEX);
  root.setProperty("--pulse-accent-highlight", theme?.accentHighlight || PULSE_ACCENT_HIGHLIGHT_DEFAULT_HEX);
}

/**
 * Applies dev-mode theme/domain-hue overrides from preferences at runtime —
 * CSS custom properties for accent colors (lib/pulse.ts's PULSE_ACCENT*
 * constants reference them) and a module-level map for domainHue(). Loads
 * once on mount and re-applies whenever Settings saves a change.
 */
export function useThemeOverrides(): void {
  useEffect(() => {
    const desktop = typeof window !== "undefined" ? window.desktop : undefined;
    if (!desktop?.data?.getPreferences) return;

    let cancelled = false;
    desktop.data
      .getPreferences()
      .then((preferences) => {
        if (cancelled) return;
        applyTheme(preferences.themeOverrides);
        setDomainHueOverrides(preferences.domainHueOverrides);
      })
      .catch(() => {});

    const unsubscribe = desktop.preferences?.onChanged?.((preferences) => {
      applyTheme(preferences?.themeOverrides);
      setDomainHueOverrides(preferences?.domainHueOverrides);
    });

    return () => {
      cancelled = true;
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);
}
