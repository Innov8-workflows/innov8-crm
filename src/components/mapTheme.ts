"use client";

import { useEffect, useState } from "react";

// Shared by both Coverage Map tabs (MapView's Leads map and AdCoverage).

// Detect whether a dark theme is active (class like theme-midnight, theme-slate...)
export function useIsDarkTheme(): boolean {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const check = () => {
      const cls = document.documentElement.className;
      setDark(!cls.includes("theme-light"));
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

// Both themes use the standard OpenStreetMap tiles. The dark look is a CSS
// filter on the TILE layer only (.crm-dark-tiles in globals.css), so pins and
// coverage circles keep their real colours. It used to be CARTO's dark_all
// basemap, but CARTO started serving an "API KEY REQUIRED" watermark image
// (HTTP 200, so nothing errors) to keyless use in Sept 2026 — a keyed
// provider would mean an account and a key in the page for no real gain.
export function tileLayerFor(isDark: boolean) {
  return {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    className: isDark ? "crm-dark-tiles" : "",
  };
}

export const UK_CENTER: [number, number] = [54.5, -2.5];
export const UK_ZOOM = 6;
