"use client";

import type { Category, Die, GameState, ScoreCard } from "@/lib/game/types";
import {
  UPPER_CATEGORIES,
  LOWER_CATEGORIES,
  ALL_CATEGORIES,
} from "@/lib/game/types";
import {
  scoreCategory as computeScore,
  computeUpperBonus,
  computeTotal,
} from "@/lib/game/rules";

const CATEGORY_LABELS: Record<Category, string> = {
  aces: "Aces",
  twos: "Twos",
  threes: "Threes",
  fours: "Fours",
  fives: "Fives",
  sixes: "Sixes",
  threeOfAKind: "Three of a kind",
  fourOfAKind: "Four of a kind",
  fullHouse: "Full House",
  smallStraight: "Small Straight",
  largeStraight: "Large Straight",
  yams: "YAMS!",
  chance: "Chance",
};

interface Props {
  game: GameState;
  clientId: string | null;
  onScore: (category: Category) => void;
}

interface ScorecardRowProps {
  category: Category;
  card: ScoreCard;
  dice: Die[];
  isMyTurn: boolean;
  rollsLeft: number;
  onScore: (category: Category) => void;
}

function ScorecardRow({
  category,
  card,
  dice,
  isMyTurn,
  rollsLeft,
  onScore,
}: ScorecardRowProps) {
  const scored = card[category] !== undefined;
  const preview = !scored && isMyTurn && rollsLeft < 3
    ? computeScore(dice, category)
    : null;
  const canClick = !scored && isMyTurn && rollsLeft === 0;

  return (
    <tr
      onClick={() => canClick && onScore(category)}
      className={[
        "border-b border-slate-700/50 transition-colors",
        canClick
          ? "cursor-pointer hover:bg-emerald-900/30"
          : "cursor-default",
        scored ? "opacity-60" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <td className="py-2 px-3 text-slate-300 text-sm">
        {CATEGORY_LABELS[category]}
      </td>
      <td className="py-2 px-3 text-right w-16">
        {scored ? (
          <span className="text-white font-semibold">{card[category]}</span>
        ) : preview !== null ? (
          <span className={`text-sm font-medium ${preview > 0 ? "text-emerald-400" : "text-slate-600"}`}>
            {preview}
          </span>
        ) : (
          <span className="text-slate-700">—</span>
        )}
      </td>
    </tr>
  );
}

export function Scorecard({ game, clientId, onScore }: Props) {
  const isMyTurn = game.currentPlayerId === clientId;
  const myCard = clientId ? game.scores[clientId] ?? {} : {};

  const upperBonus = computeUpperBonus(myCard);
  const upperTotal = UPPER_CATEGORIES.reduce(
    (sum, cat) => sum + (myCard[cat] ?? 0),
    0
  );
  const total = computeTotal(myCard);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <h2 className="text-white font-bold text-lg mb-4 px-1">Scorecard</h2>

      <table className="w-full text-left mb-1">
        <thead>
          <tr>
            <th className="py-1 px-3 text-slate-500 text-xs font-semibold uppercase tracking-wider">
              Upper section
            </th>
            <th className="py-1 px-3 text-slate-500 text-xs text-right">Pts</th>
          </tr>
        </thead>
        <tbody>
          {UPPER_CATEGORIES.map((cat) => (
            <ScorecardRow
              key={cat}
              category={cat}
              card={myCard}
              dice={game.dice}
              isMyTurn={isMyTurn}
              rollsLeft={game.rollsLeft}
              onScore={onScore}
            />
          ))}
          <tr className="border-b border-slate-600">
            <td className="py-2 px-3 text-slate-400 text-sm">
              Subtotal{" "}
              <span className="text-slate-600 text-xs">
                ({upperTotal}/63 for bonus)
              </span>
            </td>
            <td className="py-2 px-3 text-right text-slate-400 text-sm">
              {upperTotal}
            </td>
          </tr>
          <tr className="border-b border-slate-700/50">
            <td className="py-2 px-3 text-slate-300 text-sm">
              Bonus{" "}
              <span className="text-slate-500 text-xs">(+35 if ≥63)</span>
            </td>
            <td className="py-2 px-3 text-right">
              {upperBonus > 0 ? (
                <span className="text-emerald-400 font-semibold">+35</span>
              ) : (
                <span className="text-slate-700 text-sm">—</span>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <table className="w-full text-left mb-4">
        <thead>
          <tr>
            <th className="py-1 px-3 text-slate-500 text-xs font-semibold uppercase tracking-wider">
              Lower section
            </th>
            <th className="py-1 px-3 text-slate-500 text-xs text-right">Pts</th>
          </tr>
        </thead>
        <tbody>
          {LOWER_CATEGORIES.map((cat) => (
            <ScorecardRow
              key={cat}
              category={cat}
              card={myCard}
              dice={game.dice}
              isMyTurn={isMyTurn}
              rollsLeft={game.rollsLeft}
              onScore={onScore}
            />
          ))}
        </tbody>
      </table>

      <div className="mt-auto border-t-2 border-slate-600 pt-3 px-3 flex justify-between items-center">
        <span className="text-slate-300 font-semibold">Total</span>
        <span className="text-white font-bold text-xl">{total}</span>
      </div>

      {/* Other players' totals */}
      {game.players.filter((p) => p.id !== clientId).length > 0 && (
        <div className="mt-4 border-t border-slate-700 pt-3">
          <h3 className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2 px-1">
            Other players
          </h3>
          <div className="space-y-1">
            {game.players
              .filter((p) => p.id !== clientId)
              .map((p) => {
                const pCard = game.scores[p.id] ?? {};
                const pTotal = computeTotal(pCard);
                const filled = ALL_CATEGORIES.filter(
                  (c) => pCard[c] !== undefined
                ).length;
                return (
                  <div
                    key={p.id}
                    className={`flex justify-between items-center px-3 py-1.5 rounded-lg text-sm ${
                      p.id === game.currentPlayerId ? "bg-slate-700/50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          p.id === game.currentPlayerId
                            ? "bg-emerald-400"
                            : "bg-slate-600"
                        }`}
                      />
                      <span className="text-slate-300">{p.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-white font-medium">{pTotal}</span>
                      <span className="text-slate-600 text-xs ml-1">
                        ({filled}/13)
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
