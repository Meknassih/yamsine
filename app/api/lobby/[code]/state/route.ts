import { NextResponse } from "next/server";
import type { Lobby, GameState, GameOverPayload, PlayAgainState } from "@/lib/game/types";
import { reconnectPlayer } from "@/lib/game/engine";
import {
  lobbies,
  games,
  lobbyMembers,
  gameOvers,
  playAgainStates,
  versions,
  kickedClients,
  markDisconnected,
  touchClient,
} from "@/lib/api/store";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId") || "";
  const since = parseInt(url.searchParams.get("version") || "0", 10);

  const kicked = kickedClients.get(clientId);
  if (kicked && kicked.lobbyCode === code) {
    kickedClients.delete(clientId);
    return NextResponse.json({ kicked: { reason: kicked.reason } });
  }

  const lobby = lobbies.get(code);
  if (!lobby) {
    return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
  }

  const members = lobbyMembers.get(code);
  const isMember = members?.has(clientId) ?? false;

  if (clientId && !isMember) {
    const isPlayer = lobby.players.some((p) => p.id === clientId);
    if (isPlayer) {
      return NextResponse.json({ kicked: { reason: "You were removed from the lobby." } });
    }
    return NextResponse.json({ error: "Not a member of this lobby" }, { status: 403 });
  }

  if (clientId) {
    touchClient(clientId);
    reconnectPlayer(lobby, games.get(code), clientId);
  }

  markDisconnected(code);

  const currentVersion = versions.get(code) ?? 0;
  if (since > 0 && since >= currentVersion) {
    return NextResponse.json({ unchanged: true, version: currentVersion });
  }

  const game = games.get(code);
  const gameOver = gameOvers.get(code);
  const playAgain = playAgainStates.get(code);

  const res: {
    lobby: Lobby;
    game?: GameState | null;
    gameOver?: GameOverPayload | null;
    playAgain?: PlayAgainState | null;
    version: number;
  } = {
    lobby,
    version: currentVersion,
  };

  if (lobby.status === "ended") {
    res.gameOver = gameOver ?? null;
    res.playAgain = playAgain ?? null;
  } else if (game) {
    res.game = game;
  }

  return NextResponse.json(res);
}
