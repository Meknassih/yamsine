import { nanoid } from "nanoid";
import type { Category, Die, GameState, Lobby, Player, ScoreCard } from "./types";
import { ALL_CATEGORIES } from "./types";
import { scoreCategory, computeTotal } from "./rules";

function randomDie(): Die {
  return {
    value: (Math.floor(Math.random() * 6) + 1) as Die["value"],
    kept: false,
  };
}

export function createLobby(playerName: string, clientId: string): Lobby {
  const code = nanoid(6).toUpperCase();
  return {
    code,
    hostId: clientId,
    players: [{ id: clientId, name: playerName, connected: true }],
    status: "waiting",
  };
}

export function joinLobby(
  lobby: Lobby,
  playerName: string,
  clientId: string
): { error?: string } {
  if (lobby.status !== "waiting") return { error: "Game already started" };
  if (lobby.players.length >= 8) return { error: "Lobby is full" };
  if (lobby.players.find((p) => p.id === clientId)) {
    lobby.players = lobby.players.map((p) =>
      p.id === clientId ? { ...p, name: playerName, connected: true } : p
    );
    return {};
  }
  lobby.players.push({ id: clientId, name: playerName, connected: true });
  return {};
}

export function startGame(lobby: Lobby): GameState {
  const players = [...lobby.players].sort(() => Math.random() - 0.5);
  const scores: Record<string, ScoreCard> = {};
  for (const p of players) scores[p.id] = {};
  lobby.status = "playing";
  return {
    lobbyCode: lobby.code,
    players,
    scores,
    currentPlayerId: players[0].id,
    rollsLeft: 3,
    dice: [randomDie(), randomDie(), randomDie(), randomDie(), randomDie()].map(
      (d) => ({ ...d, kept: false })
    ),
    turn: 0,
  };
}

export function rollDice(
  gameState: GameState,
  keptIndices: number[]
): { error?: string } {
  if (gameState.rollsLeft === 0) return { error: "No rolls left" };

  const newDice = gameState.dice.map((die, i) => {
    if (gameState.rollsLeft === 3) {
      // First roll: always roll all dice
      return { ...randomDie(), kept: false };
    }
    // Subsequent rolls: keep dice at kept indices, reroll the rest
    if (keptIndices.includes(i)) {
      return { ...die, kept: true };
    }
    return { ...randomDie(), kept: false };
  });

  gameState.dice = newDice;
  gameState.rollsLeft -= 1;
  return {};
}

function isGameOver(gameState: GameState): boolean {
  return gameState.players.every((p) => {
    const card = gameState.scores[p.id];
    return ALL_CATEGORIES.every((cat) => (card as Record<string, number | undefined>)[cat] !== undefined);
  });
}

function nextPlayer(gameState: GameState): string {
  const idx = gameState.players.findIndex(
    (p) => p.id === gameState.currentPlayerId
  );
  return gameState.players[(idx + 1) % gameState.players.length].id;
}

export function applyScoreCategory(
  gameState: GameState,
  category: Category,
  playerId: string
): { error?: string; gameOver?: boolean } {
  if (gameState.currentPlayerId !== playerId)
    return { error: "Not your turn" };
  if (gameState.rollsLeft === 3) return { error: "You must roll first" };

  const card = gameState.scores[playerId];
  if (card[category] !== undefined) return { error: "Category already filled" };

  card[category] = scoreCategory(gameState.dice, category);

  if (isGameOver(gameState)) {
    return { gameOver: true };
  }

  gameState.currentPlayerId = nextPlayer(gameState);
  gameState.rollsLeft = 3;
  gameState.dice = gameState.dice.map((d) => ({ ...d, kept: false }));
  gameState.turn += 1;

  return {};
}

export function reconnectPlayer(
  lobby: Lobby | undefined,
  gameState: GameState | undefined,
  clientId: string
): void {
  if (lobby) {
    lobby.players = lobby.players.map((p) =>
      p.id === clientId ? { ...p, connected: true } : p
    );
  }
  if (gameState) {
    gameState.players = gameState.players.map((p) =>
      p.id === clientId ? { ...p, connected: true } : p
    );
  }
}

export function getWinner(gameState: GameState): Player {
  let best: Player = gameState.players[0];
  let bestTotal = computeTotal(gameState.scores[best.id]);
  for (const p of gameState.players.slice(1)) {
    const total = computeTotal(gameState.scores[p.id]);
    if (total > bestTotal) {
      bestTotal = total;
      best = p;
    }
  }
  return best;
}
