"use client";

import { useSyncExternalStore } from "react";

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 1023px)").matches;
}

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia("(max-width: 1023px)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
