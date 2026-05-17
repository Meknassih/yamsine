"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  Category,
  GameState,
  Lobby,
  Player,
  PlayAgainState,
  ScoreCard,
} from "@/lib/game/types";

function generateClientId(): string {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getClientId(): string {
  let id = localStorage.getItem("yamsine_client_id");
  if (!id) {
    id = generateClientId();
    localStorage.setItem("yamsine_client_id", id);
  }
  return id;
}

const noopSubscribe = () => () => {};

const POLL_INTERVAL_MS = 800;

export type GameSocketState = {
  connected: boolean;
  lobby: Lobby | null;
  game: GameState | null;
  gameOver: { scores: Record<string, ScoreCard>; winner: Player; players: Player[] } | null;
  playAgain: PlayAgainState | null;
  kicked: { reason: string } | null;
  error: string | null;
  clientId: string | null;
  createLobby: (playerName: string) => void;
  joinLobby: (lobbyCode: string, playerName: string) => void;
  startGame: (lobbyCode: string) => void;
  rollDice: (lobbyCode: string, keptIndices: number[]) => void;
  scoreCategory: (lobbyCode: string, category: Category) => void;
  requestPlayAgain: (lobbyCode: string) => void;
  reconnect: (lobbyCode: string) => void;
  clearError: () => void;
  leaveSession: () => void;
  debugSkipToEnd: (lobbyCode: string) => void;
};

export const GameSocketContext = createContext<GameSocketState | null>(null);

export function GameApiProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [gameOver, setGameOver] =
    useState<GameSocketState["gameOver"]>(null);
  const [playAgain, setPlayAgain] = useState<PlayAgainState | null>(null);
  const [kicked, setKicked] = useState<{ reason: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const versionRef = useRef(0);
  const activeCodeRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const [connected, setConnected] = useState(true);

  const clientId = useSyncExternalStore(
    noopSubscribe,
    () => getClientId(),
    () => null
  );

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    activeCodeRef.current = null;
  }, []);

  const startPolling = useCallback(
    (code: string) => {
      stopPolling();
      activeCodeRef.current = code;
      setConnected(true);
      const poll = async () => {
        if (!mountedRef.current || activeCodeRef.current !== code) return;
        try {
          const v = versionRef.current;
          const res = await fetch(
            `/api/lobby/${code}/state?clientId=${encodeURIComponent(clientId ?? "")}&version=${v}`
          );
          if (!res.ok) {
            if (res.status === 404 || res.status === 403) {
              stopPolling();
            }
            return;
          }
          const data = await res.json();
          if (data.unchanged) {
            versionRef.current = data.version;
            return;
          }
          if (data.kicked) {
            stopPolling();
            setKicked(data.kicked);
            setLobby(null);
            setGame(null);
            setGameOver(null);
            setPlayAgain(null);
            return;
          }
          versionRef.current = data.version;
          setLobby(data.lobby);
          setKicked(null);

          if (data.lobby.status !== "ended") {
            setGame(data.game ?? null);
            setGameOver(null);
            setPlayAgain(null);
          } else {
            setGame(null);
            setGameOver(data.gameOver ?? null);
            setPlayAgain(data.playAgain ?? null);
          }
          setError(null);
        } catch {
          // network error — will retry next poll
        }
      };
      poll();
      pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    },
    [stopPolling, clientId]
  );

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [stopPolling]);

  const post = useCallback(
    async (url: string, body: object): Promise<object | null> => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Request failed");
          return null;
        }
        return data;
      } catch {
        setError("Network error");
        return null;
      }
    },
    []
  );

  const applyState = useCallback(
    (data: object | null, code?: string) => {
      if (!data) return;
      const d = data as Record<string, unknown>;
      if (d.version !== undefined) versionRef.current = d.version as number;
      if (d.lobby) setLobby(d.lobby as Lobby);
      if (d.game) {
        setGame(d.game as GameState);
        setGameOver(null);
        setPlayAgain(null);
      }
      if (d.gameOver !== undefined) {
        if (d.gameOver) setGameOver(d.gameOver as GameSocketState["gameOver"]);
      }
      if (d.playAgain !== undefined) {
        setPlayAgain(d.playAgain as PlayAgainState | null);
      }
      if (d.error) setError(d.error as string);
      if (code) startPolling(code);
    },
    [startPolling]
  );

  const createLobby = useCallback(
    async (playerName: string) => {
      const data = await post("/api/lobby", {
        type: "create",
        playerName,
        clientId,
      });
      if (data) {
        const d = data as { lobby: Lobby; version: number };
        setLobby(d.lobby);
        setGame(null);
        setGameOver(null);
        setPlayAgain(null);
        setKicked(null);
        setError(null);
        versionRef.current = d.version;
        startPolling(d.lobby.code);
      }
    },
    [post, clientId, startPolling]
  );

  const joinLobby = useCallback(
    async (lobbyCode: string, playerName: string) => {
      const data = await post("/api/lobby", {
        type: "join",
        lobbyCode,
        playerName,
        clientId,
      });
      applyState(data, lobbyCode);
    },
    [post, clientId, applyState]
  );

  const startGame = useCallback(
    async (lobbyCode: string) => {
      const data = await post(`/api/lobby/${lobbyCode}/action`, {
        type: "start_game",
        clientId,
      });
      applyState(data, lobbyCode);
    },
    [post, clientId, applyState]
  );

  const rollDice = useCallback(
    async (lobbyCode: string, keptIndices: number[]) => {
      const data = await post(`/api/lobby/${lobbyCode}/action`, {
        type: "roll_dice",
        clientId,
        keptIndices,
      });
      applyState(data);
    },
    [post, clientId, applyState]
  );

  const scoreCategory = useCallback(
    async (lobbyCode: string, category: Category) => {
      const data = await post(`/api/lobby/${lobbyCode}/action`, {
        type: "score_category",
        clientId,
        category,
      });
      applyState(data);
    },
    [post, clientId, applyState]
  );

  const reconnect = useCallback(
    (lobbyCode: string) => {
      startPolling(lobbyCode);
    },
    [startPolling]
  );

  const clearError = useCallback(() => setError(null), []);

  const debugSkipToEnd = useCallback(
    async (lobbyCode: string) => {
      const data = await post(`/api/lobby/${lobbyCode}/action`, {
        type: "debug_skip_to_end",
        clientId,
      });
      applyState(data);
    },
    [post, clientId, applyState]
  );

  const requestPlayAgain = useCallback(
    async (lobbyCode: string) => {
      const data = await post(`/api/lobby/${lobbyCode}/action`, {
        type: "play_again",
        clientId,
      });
      applyState(data);
    },
    [post, clientId, applyState]
  );

  const leaveSession = useCallback(() => {
    stopPolling();
    versionRef.current = 0;
    setLobby(null);
    setGame(null);
    setGameOver(null);
    setPlayAgain(null);
    setKicked(null);
    setError(null);
  }, [stopPolling]);

  const value: GameSocketState = {
    connected,
    lobby,
    game,
    gameOver,
    playAgain,
    kicked,
    error,
    clientId,
    createLobby,
    joinLobby,
    startGame,
    rollDice,
    scoreCategory,
    requestPlayAgain,
    reconnect,
    clearError,
    leaveSession,
    debugSkipToEnd,
  };

  return (
    <GameSocketContext.Provider value={value}>
      {children}
    </GameSocketContext.Provider>
  );
}
