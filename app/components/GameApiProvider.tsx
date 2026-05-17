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

interface SSEPayload {
  lobby: Lobby;
  game?: GameState | null;
  gameOver?: { scores: Record<string, ScoreCard>; winner: Player; players: Player[] } | null;
  playAgain?: PlayAgainState | null;
  version: number;
}

export type GameSocketState = {
  connected: boolean;
  lobby: Lobby | null;
  game: GameState | null;
  gameOver: { scores: Record<string, ScoreCard>; winner: Player; players: Player[] } | null;
  playAgain: PlayAgainState | null;
  kicked: { reason: string } | null;
  error: string | null;
  clientId: string | null;
  isRolling: boolean;
  createLobby: (playerName: string) => void;
  joinLobby: (lobbyCode: string, playerName: string) => void;
  startGame: (lobbyCode: string) => void;
  rollDice: (lobbyCode: string, keptIndices: number[]) => void;
  scoreCategory: (lobbyCode: string, category: Category) => void;
  requestPlayAgain: (lobbyCode: string) => void;
  reconnect: (lobbyCode: string) => void;
  clearError: () => void;
  leaveGame: (lobbyCode: string) => Promise<void>;
  leaveLobby: (lobbyCode: string) => Promise<void>;
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
  const [isRolling, setIsRolling] = useState(false);
  const versionRef = useRef(0);
  const activeCodeRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const mountedRef = useRef(true);
  const [connected, setConnected] = useState(true);

  const isRollingRef = useRef(false);
  const rollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const diceKeyRef = useRef("");
  const prevPlayerIdRef = useRef("");
  const ROLL_DURATION = 800;

  useEffect(() => {
    if (game) {
      diceKeyRef.current = game.dice.map((d) => d.value).join(",");
      prevPlayerIdRef.current = game.currentPlayerId;
    }
  }, [game]);

  const startRolling = useCallback(() => {
    isRollingRef.current = true;
    setIsRolling(true);
    if (rollTimerRef.current) clearTimeout(rollTimerRef.current);
    rollTimerRef.current = setTimeout(() => {
      isRollingRef.current = false;
      setIsRolling(false);
    }, ROLL_DURATION);
  }, []);

  const clientId = useSyncExternalStore(
    noopSubscribe,
    () => getClientId(),
    () => null
  );

  const disconnectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    activeCodeRef.current = null;
  }, []);

  const connectSSE = useCallback(
    (code: string) => {
      disconnectSSE();
      activeCodeRef.current = code;

      const url = `/api/lobby/${code}/events?clientId=${encodeURIComponent(clientId ?? "")}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        if (!mountedRef.current || activeCodeRef.current !== code) {
          es.close();
          return;
        }
        setConnected(true);
        setKicked(null);
      };

      es.onmessage = (event) => {
        if (!mountedRef.current || activeCodeRef.current !== code) return;
        const eventVersion = parseInt(event.lastEventId, 10);
        if (eventVersion <= versionRef.current) return;
        versionRef.current = eventVersion;

        let data: SSEPayload;
        try {
          data = JSON.parse(event.data) as SSEPayload;
        } catch {
          return;
        }

        const newGame = data.game;
        if (newGame && diceKeyRef.current !== "") {
          const newDiceKey = newGame.dice.map((d) => d.value).join(",");
          const diceChanged = newDiceKey !== diceKeyRef.current;
          const turnChanged = newGame.currentPlayerId !== prevPlayerIdRef.current;
          if (diceChanged && !turnChanged && !isRollingRef.current) {
            startRolling();
          }
          diceKeyRef.current = newDiceKey;
          prevPlayerIdRef.current = newGame.currentPlayerId;
        }

        setLobby(data.lobby);
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
      };

      es.addEventListener("kicked", (event: MessageEvent) => {
        if (!mountedRef.current || activeCodeRef.current !== code) return;
        let reason: string;
        try {
          reason = (JSON.parse(event.data) as { reason: string }).reason;
        } catch {
          reason = "You have been removed from the game.";
        }
        disconnectSSE();
        versionRef.current = 0;
        setKicked({ reason });
        setLobby(null);
        setGame(null);
        setGameOver(null);
        setPlayAgain(null);
      });

      es.onerror = () => {
        if (!mountedRef.current) return;
        if (es.readyState === EventSource.CLOSED) {
          setConnected(false);
          if (activeCodeRef.current === code) {
            setError("Connection lost. Refresh to reconnect.");
          }
        } else {
          setConnected(false);
        }
      };
    },
    [clientId, disconnectSSE, startRolling]
  );

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      disconnectSSE();
      if (rollTimerRef.current) clearTimeout(rollTimerRef.current);
    };
  }, [disconnectSSE]);

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
    (data: object | null) => {
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
    },
    []
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
        connectSSE(d.lobby.code);
      }
    },
    [post, clientId, connectSSE]
  );

  const joinLobby = useCallback(
    async (lobbyCode: string, playerName: string) => {
      const data = await post("/api/lobby", {
        type: "join",
        lobbyCode,
        playerName,
        clientId,
      });
      applyState(data);
      if (data) connectSSE(lobbyCode);
    },
    [post, clientId, applyState, connectSSE]
  );

  const startGame = useCallback(
    async (lobbyCode: string) => {
      const data = await post(`/api/lobby/${lobbyCode}/action`, {
        type: "start_game",
        clientId,
      });
      applyState(data);
    },
    [post, clientId, applyState]
  );

  const rollDice = useCallback(
    async (lobbyCode: string, keptIndices: number[]) => {
      startRolling();
      const data = await post(`/api/lobby/${lobbyCode}/action`, {
        type: "roll_dice",
        clientId,
        keptIndices,
      });
      applyState(data);
    },
    [post, clientId, applyState, startRolling]
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
      connectSSE(lobbyCode);
    },
    [connectSSE]
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
    disconnectSSE();
    versionRef.current = 0;
    setLobby(null);
    setGame(null);
    setGameOver(null);
    setPlayAgain(null);
    setKicked(null);
    setError(null);
  }, [disconnectSSE]);

  const leaveGame = useCallback(
    async (lobbyCode: string) => {
      await post(`/api/lobby/${lobbyCode}/action`, {
        type: "leave_game",
        clientId,
      });
      leaveSession();
    },
    [post, clientId, leaveSession]
  );

  const leaveLobby = useCallback(
    async (lobbyCode: string) => {
      await post(`/api/lobby/${lobbyCode}/action`, {
        type: "leave_lobby",
        clientId,
      });
      leaveSession();
    },
    [post, clientId, leaveSession]
  );

  const value: GameSocketState = {
    connected,
    lobby,
    game,
    gameOver,
    playAgain,
    kicked,
    error,
    clientId,
    isRolling,
    createLobby,
    joinLobby,
    startGame,
    rollDice,
    scoreCategory,
    requestPlayAgain,
    reconnect,
    clearError,
    leaveGame,
    leaveLobby,
    leaveSession,
    debugSkipToEnd,
  };

  return (
    <GameSocketContext.Provider value={value}>
      {children}
    </GameSocketContext.Provider>
  );
}
