import { NextResponse } from "next/server";
import type { Category, PlayAgainState } from "@/lib/game/types";
import {
  startGame,
  rollDice,
  applyScoreCategory,
  debugSkipToEnd,
  getWinner,
  resetLobbyForReplay,
} from "@/lib/game/engine";
import {
  lobbies,
  games,
  lobbyMembers,
  gameOvers,
  playAgainStates,
  playAgainTimers,
  kickedClients,
  incrementVersion,
  touchClient,
} from "@/lib/api/store";

const PLAY_AGAIN_COUNTDOWN_MS = 10_000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  let body: {
    type: string;
    clientId?: string;
    keptIndices?: number[];
    category?: Category;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, clientId = "" } = body;

  if (!clientId) {
    return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  }

  touchClient(clientId);

  const lobby = lobbies.get(code);
  if (!lobby) {
    return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
  }

  const members = lobbyMembers.get(code);
  if (!members?.has(clientId)) {
    return NextResponse.json({ error: "Not a member of this lobby" }, { status: 403 });
  }

  switch (type) {
    case "start_game": {
      if (lobby.hostId !== clientId) {
        return NextResponse.json({ error: "Only the host can start the game" }, { status: 403 });
      }
      if (lobby.players.length < 2) {
        return NextResponse.json({ error: "Need at least 2 players" }, { status: 400 });
      }
      const game = startGame(lobby);
      games.set(code, game);
      incrementVersion(code);
      return NextResponse.json({ game });
    }

    case "roll_dice": {
      const game = games.get(code);
      if (!game) {
        return NextResponse.json({ error: "Game not found" }, { status: 404 });
      }
      if (game.currentPlayerId !== clientId) {
        return NextResponse.json({ error: "Not your turn" }, { status: 403 });
      }
      const result = rollDice(game, body.keptIndices ?? []);
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      incrementVersion(code);
      return NextResponse.json({ game });
    }

    case "score_category": {
      const game = games.get(code);
      if (!game) {
        return NextResponse.json({ error: "Game not found" }, { status: 404 });
      }
      const result = applyScoreCategory(game, body.category!, clientId);
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      if (result.gameOver) {
        endGame(code);
        const gameOver = gameOvers.get(code);
        const playAgain = playAgainStates.get(code);
        incrementVersion(code);
        return NextResponse.json({ lobby, gameOver, playAgain });
      }
      incrementVersion(code);
      return NextResponse.json({ game });
    }

    case "play_again": {
      return handlePlayAgain(code, clientId);
    }

    case "debug_skip_to_end": {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json(
          { error: "Debug actions are disabled in production" },
          { status: 403 }
        );
      }
      const game = games.get(code);
      if (!game) {
        return NextResponse.json({ error: "Game not found" }, { status: 404 });
      }
      const result = debugSkipToEnd(game, clientId);
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      incrementVersion(code);
      return NextResponse.json({ game });
    }

    default:
      return NextResponse.json({ error: "Unknown action type" }, { status: 400 });
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
}

function handlePlayAgain(
  lobbyCode: string,
  clientId: string
): NextResponse {
  const lobby = lobbies.get(lobbyCode);
  if (!lobby || lobby.status !== "ended") {
    return NextResponse.json({ error: "Game is not over" }, { status: 400 });
  }
  if (!lobby.players.find((p) => p.id === clientId)) {
    return NextResponse.json({ error: "Not a player in this lobby" }, { status: 403 });
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
  incrementVersion(lobbyCode);

  return NextResponse.json({
    lobby,
    gameOver: gameOvers.get(lobbyCode) ?? null,
    playAgain: state,
  });
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

  for (const id of kicked) {
    kickedClients.set(id, {
      lobbyCode,
      reason: "You didn't click Play again in time.",
    });
    members?.delete(id);
  }

  resetLobbyForReplay(lobby, keepers);
  games.delete(lobbyCode);
  gameOvers.delete(lobbyCode);
  playAgainStates.delete(lobbyCode);

  incrementVersion(lobbyCode);
}
