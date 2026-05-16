"use client";

import { useContext } from "react";
import {
  GameSocketContext,
  type GameSocketState,
} from "@/app/components/GameSocketProvider";

export type { GameSocketState };

export function useGameSocket(): GameSocketState {
  const ctx = useContext(GameSocketContext);
  if (!ctx) {
    throw new Error(
      "useGameSocket must be used within a <GameSocketProvider>. Did you forget to wrap your app in app/layout.tsx?"
    );
  }
  return ctx;
}
