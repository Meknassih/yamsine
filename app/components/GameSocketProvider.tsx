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
  ScoreCard,
  ServerMessage,
} from "@/lib/game/types";

function getClientId(): string {
  let id = localStorage.getItem("yamsine_client_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("yamsine_client_id", id);
  }
  return id;
}

const noopSubscribe = () => () => {};

function getWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

const WS_READY_STATE_LABEL: Record<number, string> = {
  [WebSocket.CONNECTING]: "CONNECTING",
  [WebSocket.OPEN]: "OPEN",
  [WebSocket.CLOSING]: "CLOSING",
  [WebSocket.CLOSED]: "CLOSED",
};

function describeWebSocketErrorEvent(event: Event, url: string): string {
  const base = {
    type: event.type,
    timeStamp: event.timeStamp,
    isTrusted: event.isTrusted,
  };

  let targetDetail: Record<string, unknown> | null = null;
  const t = event.target;
  if (t instanceof WebSocket) {
    targetDetail = {
      kind: "WebSocket",
      url: t.url,
      expectedUrl: url,
      readyState: t.readyState,
      readyStateLabel:
        WS_READY_STATE_LABEL[t.readyState] ?? `UNKNOWN(${t.readyState})`,
      protocol: t.protocol || "(empty)",
      extensions: t.extensions || "(empty)",
      binaryType: t.binaryType,
      bufferedAmount: t.bufferedAmount,
    };
  } else if (t != null) {
    targetDetail = { kind: t.constructor?.name ?? typeof t, string: String(t) };
  }

  return JSON.stringify({ ...base, target: targetDetail }, null, 0);
}

export type GameSocketState = {
  connected: boolean;
  lobby: Lobby | null;
  game: GameState | null;
  gameOver: { scores: Record<string, ScoreCard>; winner: Player } | null;
  error: string | null;
  clientId: string | null;
  createLobby: (playerName: string) => void;
  joinLobby: (lobbyCode: string, playerName: string) => void;
  startGame: (lobbyCode: string) => void;
  rollDice: (lobbyCode: string, keptIndices: number[]) => void;
  scoreCategory: (lobbyCode: string, category: Category) => void;
  reconnect: (lobbyCode: string) => void;
  clearError: () => void;
};

export const GameSocketContext = createContext<GameSocketState | null>(null);

export function GameSocketProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [gameOver, setGameOver] =
    useState<GameSocketState["gameOver"]>(null);
  const [error, setError] = useState<string | null>(null);
  // Read clientId from localStorage on the client; null during SSR.
  // useSyncExternalStore avoids the lint warning about setState-in-effect
  // and gives us a stable client-only value usable during render.
  const clientId = useSyncExternalStore(
    noopSubscribe,
    () => getClientId(),
    () => null
  );

  useEffect(() => {
    let intentionalClose = false;
    let opened = false;

    const url = getWsUrl();
    console.debug("[WS] connecting to", url);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      opened = true;
      console.debug("[WS] connected");
      setConnected(true);
    };

    ws.onclose = (event: CloseEvent) => {
      console.debug(
        `[WS] closed — code=${event.code} reason=${JSON.stringify(event.reason)} wasClean=${event.wasClean} intentional=${intentionalClose} opened=${opened}`
      );
      if (intentionalClose) return;
      setConnected(false);
      if (!opened) return;
      if (event.code !== 1000 && event.code !== 1001) {
        const reason = event.reason ? `: ${event.reason}` : "";
        setError(
          `Connection lost (WebSocket close code ${event.code}${reason})`
        );
      }
    };

    ws.onerror = (event: Event) => {
      // The browser fires an `error` event with no useful detail when a
      // WebSocket is closed before the handshake completes — this happens
      // routinely with React Strict Mode's double-mount in development and
      // when the page unmounts mid-connect. Demote to debug in those cases.
      if (intentionalClose || !opened) {
        console.debug(
          "[WS] error event during connect/intentional close — ignored"
        );
        return;
      }
      const detail = describeWebSocketErrorEvent(event, url);
      console.error(
        `[WS] error event (details in subsequent close event): ${detail}`
      );
      setError(
        `WebSocket error connecting to ${url} — see following close event for details`
      );
    };

    ws.onmessage = (event: MessageEvent) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string) as ServerMessage;
      } catch (e) {
        console.error("[WS] failed to parse message:", event.data, e);
        return;
      }
      console.debug("[WS] received:", msg.type, msg.payload);
      switch (msg.type) {
        case "lobby_updated":
          // The provider lives at the root and keeps state across navigations,
          // so a fresh lobby_updated means we left any previous game/result.
          setLobby(msg.payload);
          setGame(null);
          setGameOver(null);
          break;
        case "game_updated":
          setGame(msg.payload);
          setGameOver(null);
          break;
        case "game_over":
          setGameOver(msg.payload);
          break;
        case "error":
          console.warn("[WS] server error:", msg.payload.message);
          setError(msg.payload.message);
          break;
      }
    };

    return () => {
      intentionalClose = true;
      console.debug("[WS] closing intentionally (provider cleanup)");
      ws.close();
    };
  }, []);

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      console.warn(
        `[WS] tried to send while readyState=${wsRef.current?.readyState ?? "none"}`,
        msg
      );
    }
  }, []);

  const createLobby = useCallback(
    (playerName: string) => {
      send({
        type: "create_lobby",
        payload: { playerName, clientId },
      });
    },
    [send, clientId]
  );

  const joinLobby = useCallback(
    (lobbyCode: string, playerName: string) => {
      send({
        type: "join_lobby",
        payload: { lobbyCode, playerName, clientId },
      });
    },
    [send, clientId]
  );

  const startGame = useCallback(
    (lobbyCode: string) => {
      send({
        type: "start_game",
        payload: { lobbyCode, clientId },
      });
    },
    [send, clientId]
  );

  const rollDice = useCallback(
    (lobbyCode: string, keptIndices: number[]) => {
      send({
        type: "roll_dice",
        payload: { lobbyCode, keptIndices, clientId },
      });
    },
    [send, clientId]
  );

  const scoreCategory = useCallback(
    (lobbyCode: string, category: Category) => {
      send({
        type: "score_category",
        payload: { lobbyCode, category, clientId },
      });
    },
    [send, clientId]
  );

  const reconnect = useCallback(
    (lobbyCode: string) => {
      send({
        type: "reconnect",
        payload: { lobbyCode, clientId },
      });
    },
    [send, clientId]
  );

  const clearError = useCallback(() => setError(null), []);

  const value: GameSocketState = {
    connected,
    lobby,
    game,
    gameOver,
    error,
    clientId,
    createLobby,
    joinLobby,
    startGame,
    rollDice,
    scoreCategory,
    reconnect,
    clearError,
  };

  return (
    <GameSocketContext.Provider value={value}>
      {children}
    </GameSocketContext.Provider>
  );
}
