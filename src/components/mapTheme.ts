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

export function tileLayerFor(isDark: boolean) {
  return isDark
    ? {
        url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }
    : {
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      };
}

export const UK_CENTER: [number, number] = [54.5, -2.5];
export const UK_ZOOM = 6;
