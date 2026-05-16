import type { WebSocket } from "ws";
import type { ClientMessage, PlayAgainState } from "../game/types";
import {
  createLobby,
  joinLobby,
  startGame,
  rollDice,
  applyScoreCategory,
  reconnectPlayer,
  getWinner,
  debugSkipToEnd,
  resetLobbyForReplay,
} from "../game/engine";
import {
  lobbies,
  games,
  connections,
  lobbyMembers,
  gameOvers,
  playAgainStates,
  playAgainTimers,
  addConnection,
  removeConnection,
  getLobbyForClient,
  broadcastToLobby,
  broadcastToClients,
} from "./store";

const PLAY_AGAIN_COUNTDOWN_MS = 10_000;

function send(ws: WebSocket, message: object): void {
  const m = message as { type: string };
  console.log(`[WS] sending: ${m.type}`);
  if (ws.readyState === 1) ws.send(JSON.stringify(message));
  else console.warn(`[WS] tried to send ${m.type} but socket readyState=${ws.readyState}`);
}

export function handleConnection(ws: WebSocket): void {
  console.log("[WS] new connection");

  ws.on("message", (raw: Buffer) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      console.warn("[WS] invalid JSON received:", raw.toString().slice(0, 200));
      send(ws, { type: "error", payload: { message: "Invalid JSON" } });
      return;
    }
    console.log(`[WS] received: ${msg.type}`, JSON.stringify(msg.payload).slice(0, 200));
    handleMessage(ws, msg);
  });

  ws.on("close", (code: number, reason: Buffer) => {
    for (const [clientId, conn] of connections) {
      if (conn === ws) {
        console.log(`[WS] client ${clientId.slice(0, 8)} disconnected — code=${code} reason=${reason.toString() || "(none)"}`);
        const lobby = getLobbyForClient(clientId);
        if (lobby) {
          lobby.players = lobby.players.map((p) =>
            p.id === clientId ? { ...p, connected: false } : p
          );
          const game = games.get(lobby.code);
          if (lobby.status === "ended") {
            // Don't clobber the game-over UI by re-broadcasting game_updated.
            if (game) {
              game.players = game.players.map((p) =>
                p.id === clientId ? { ...p, connected: false } : p
              );
            }
          } else if (game) {
            game.players = game.players.map((p) =>
              p.id === clientId ? { ...p, connected: false } : p
            );
            broadcastToLobby(lobby.code, { type: "game_updated", payload: game });
          } else {
            broadcastToLobby(lobby.code, {
              type: "lobby_updated",
              payload: lobby,
            });
          }
        }
        removeConnection(clientId);
        break;
      }
    }
  });

  ws.on("error", (err: Error) => {
    console.error("[WS] socket error:", err.message);
  });
}

function handleMessage(ws: WebSocket, msg: ClientMessage): void {
  switch (msg.type) {
    case "create_lobby": {
      const { playerName, clientId } = msg.payload;
      const lobby = createLobby(playerName, clientId);
      lobbies.set(lobby.code, lobby);
      lobbyMembers.set(lobby.code, new Set([clientId]));
      addConnection(clientId, ws);
      send(ws, { type: "lobby_updated", payload: lobby });
      break;
    }

    case "join_lobby": {
      const { lobbyCode, playerName, clientId } = msg.payload;
      const lobby = lobbies.get(lobbyCode);
      if (!lobby) {
        send(ws, { type: "error", payload: { message: "Lobby not found" } });
        return;
      }
      const result = joinLobby(lobby, playerName, clientId);
      if (result.error) {
        send(ws, { type: "error", payload: { message: result.error } });
        return;
      }
      if (!lobbyMembers.has(lobbyCode)) lobbyMembers.set(lobbyCode, new Set());
      lobbyMembers.get(lobbyCode)!.add(clientId);
      addConnection(clientId, ws);

      const game = games.get(lobbyCode);
      if (game) {
        send(ws, { type: "game_updated", payload: game });
      } else {
        broadcastToLobby(lobbyCode, { type: "lobby_updated", payload: lobby });
      }
      break;
    }

    case "start_game": {
      const { lobbyCode, clientId } = msg.payload;
      const lobby = lobbies.get(lobbyCode);
      if (!lobby) {
        send(ws, { type: "error", payload: { message: "Lobby not found" } });
        return;
      }
      if (lobby.hostId !== clientId) {
        send(ws, { type: "error", payload: { message: "Only the host can start the game" } });
        return;
      }
      if (lobby.players.length < 2) {
        send(ws, { type: "error", payload: { message: "Need at least 2 players" } });
        return;
      }
      const game = startGame(lobby);
      games.set(lobbyCode, game);
      broadcastToLobby(lobbyCode, { type: "game_updated", payload: game });
      break;
    }

    case "roll_dice": {
      const { lobbyCode, clientId, keptIndices } = msg.payload;
      const game = games.get(lobbyCode);
      if (!game) {
        send(ws, { type: "error", payload: { message: "Game not found" } });
        return;
      }
      if (game.currentPlayerId !== clientId) {
        send(ws, { type: "error", payload: { message: "Not your turn" } });
        return;
      }
      const result = rollDice(game, keptIndices);
      if (result.error) {
        send(ws, { type: "error", payload: { message: result.error } });
        return;
      }
      broadcastToLobby(lobbyCode, { type: "game_updated", payload: game });
      break;
    }

    case "score_category": {
      const { lobbyCode, clientId, category } = msg.payload;
      const game = games.get(lobbyCode);
      if (!game) {
        send(ws, { type: "error", payload: { message: "Game not found" } });
        return;
      }
      const result = applyScoreCategory(game, category, clientId);
      if (result.error) {
        send(ws, { type: "error", payload: { message: result.error } });
        return;
      }
      if (result.gameOver) {
        endGame(lobbyCode);
      } else {
        broadcastToLobby(lobbyCode, { type: "game_updated", payload: game });
      }
      break;
    }

    case "play_again": {
      const { lobbyCode, clientId } = msg.payload;
      handlePlayAgain(ws, lobbyCode, clientId);
      break;
    }

    case "debug_skip_to_end": {
      if (process.env.NODE_ENV === "production") {
        send(ws, {
          type: "error",
          payload: { message: "Debug actions are disabled in production" },
        });
        return;
      }
      const { lobbyCode, clientId } = msg.payload;
      const game = games.get(lobbyCode);
      if (!game) {
        send(ws, { type: "error", payload: { message: "Game not found" } });
        return;
      }
      const result = debugSkipToEnd(game, clientId);
      if (result.error) {
        send(ws, { type: "error", payload: { message: result.error } });
        return;
      }
      broadcastToLobby(lobbyCode, { type: "game_updated", payload: game });
      break;
    }

    case "reconnect": {
      const { lobbyCode, clientId } = msg.payload;
      const lobby = lobbies.get(lobbyCode);
      const game = games.get(lobbyCode);
      reconnectPlayer(lobby, game, clientId);
      addConnection(clientId, ws);
      if (!lobbyMembers.has(lobbyCode)) lobbyMembers.set(lobbyCode, new Set());
      lobbyMembers.get(lobbyCode)!.add(clientId);
      if (lobby?.status === "ended") {
        send(ws, { type: "lobby_updated", payload: lobby });
        const gameOver = gameOvers.get(lobbyCode);
        if (gameOver) send(ws, { type: "game_over", payload: gameOver });
        const state = playAgainStates.get(lobbyCode);
        if (state) send(ws, { type: "play_again_state", payload: state });
      } else if (game) {
        send(ws, { type: "game_updated", payload: game });
        broadcastToLobby(lobbyCode, { type: "game_updated", payload: game });
      } else if (lobby) {
        broadcastToLobby(lobbyCode, { type: "lobby_updated", payload: lobby });
      } else {
        send(ws, { type: "error", payload: { message: "Lobby not found" } });
      }
      break;
    }

    default:
      send(ws, { type: "error", payload: { message: "Unknown message type" } });
  }
}

function endGame(lobbyCode: string): void {
  const game = games.get(lobbyCode);
  const lobby = lobbies.get(lobbyCode);
  if (!game || !lobby) return;
  const winner = getWinner(game);
  const payload = { scores: game.scores, winner, players: game.players };
  gameOvers.set(lobbyCode, payload);
  lobby.status = "ended";
  playAgainStates.set(lobbyCode, {
    lobbyCode,
    voters: [],
    hostStarted: false,
    deadlineMs: null,
  });
  broadcastToLobby(lobbyCode, { type: "game_over", payload });
}

function handlePlayAgain(
  ws: WebSocket,
  lobbyCode: string,
  clientId: string
): void {
  const lobby = lobbies.get(lobbyCode);
  if (!lobby || lobby.status !== "ended") {
    send(ws, { type: "error", payload: { message: "Game is not over" } });
    return;
  }
  if (!lobby.players.find((p) => p.id === clientId)) {
    send(ws, { type: "error", payload: { message: "Not a player in this lobby" } });
    return;
  }

  const state: PlayAgainState =
    playAgainStates.get(lobbyCode) ?? {
      lobbyCode,
      voters: [],
      hostStarted: false,
      deadlineMs: null,
    };

  if (!state.voters.includes(clientId)) state.voters = [...state.voters, clientId];

  const isHost = lobby.hostId === clientId;
  if (isHost && !state.hostStarted) {
    state.hostStarted = true;
    state.deadlineMs = Date.now() + PLAY_AGAIN_COUNTDOWN_MS;

    const existing = playAgainTimers.get(lobbyCode);
    if (existing) clearTimeout(existing);
    const handle = setTimeout(() => finalizePlayAgain(lobbyCode), PLAY_AGAIN_COUNTDOWN_MS);
    playAgainTimers.set(lobbyCode, handle);
  }

  playAgainStates.set(lobbyCode, state);
  broadcastToLobby(lobbyCode, { type: "play_again_state", payload: state });
}

function finalizePlayAgain(lobbyCode: string): void {
  playAgainTimers.delete(lobbyCode);
  const lobby = lobbies.get(lobbyCode);
  const state = playAgainStates.get(lobbyCode);
  if (!lobby || !state) return;

  const keepers = new Set(state.voters);
  keepers.add(lobby.hostId);

  const members = lobbyMembers.get(lobbyCode);
  const kicked: string[] = [];
  if (members) {
    for (const memberId of members) {
      if (!keepers.has(memberId)) kicked.push(memberId);
    }
  }

  if (kicked.length > 0) {
    broadcastToClients(kicked, {
      type: "kicked",
      payload: { reason: "You didn't click Play again in time." },
    });
    const memberSet = lobbyMembers.get(lobbyCode);
    if (memberSet) for (const id of kicked) memberSet.delete(id);
  }

  resetLobbyForReplay(lobby, keepers);
  games.delete(lobbyCode);
  gameOvers.delete(lobbyCode);
  playAgainStates.delete(lobbyCode);

  broadcastToLobby(lobbyCode, { type: "lobby_updated", payload: lobby });
}
