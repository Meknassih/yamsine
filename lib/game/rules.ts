import type { Category, Die, ScoreCard } from "./types";

type DiceValues = number[];

function values(dice: Die[]): DiceValues {
  return dice.map((d) => d.value);
}

function counts(vals: DiceValues): Map<number, number> {
  const map = new Map<number, number>();
  for (const v of vals) map.set(v, (map.get(v) ?? 0) + 1);
  return map;
}

function sum(vals: DiceValues): number {
  return vals.reduce((a, b) => a + b, 0);
}

export function scoreUpper(dice: Die[], face: number): number {
  return values(dice)
    .filter((v) => v === face)
    .reduce((a, b) => a + b, 0);
}

export function scoreThreeOfAKind(dice: Die[]): number {
  const vals = values(dice);
  const c = counts(vals);
  for (const pair of c) {
    if (pair[1] >= 3) return pair[0] * 3;
  }
  return 0;
}

export function scoreFourOfAKind(dice: Die[]): number {
  const vals = values(dice);
  const c = counts(vals);
  for (const pair of c) {
    if (pair[1] >= 4) return pair[0] * 4;
  }
  return 0;
}

export function scoreFullHouse(dice: Die[]): number {
  const vals = values(dice);
  const c = counts(vals);
  const cnts = [...c.values()].sort();
  if (cnts.length === 2 && cnts[0] === 2 && cnts[1] === 3) return 25;
  return 0;
}

export function scoreSmallStraight(dice: Die[]): number {
  const unique = [...new Set(values(dice))].sort((a, b) => a - b);
  let consecutive = 1;
  let max = 1;
  for (let i = 1; i < unique.length; i++) {
    if (unique[i] === unique[i - 1] + 1) {
      consecutive++;
      if (consecutive > max) max = consecutive;
    } else {
      consecutive = 1;
    }
  }
  return max >= 4 ? 30 : 0;
}

export function scoreLargeStraight(dice: Die[]): number {
  const unique = [...new Set(values(dice))].sort((a, b) => a - b);
  if (unique.length !== 5) return 0;
  for (let i = 1; i < unique.length; i++) {
    if (unique[i] !== unique[i - 1] + 1) return 0;
  }
  return 40;
}

export function scoreYams(dice: Die[]): number {
  const vals = values(dice);
  return vals.every((v) => v === vals[0]) ? 50 : 0;
}

export function scoreChance(dice: Die[]): number {
  return sum(values(dice));
}

export function scoreCategory(dice: Die[], category: Category): number {
  switch (category) {
    case "aces":
      return scoreUpper(dice, 1);
    case "twos":
      return scoreUpper(dice, 2);
    case "threes":
      return scoreUpper(dice, 3);
    case "fours":
      return scoreUpper(dice, 4);
    case "fives":
      return scoreUpper(dice, 5);
    case "sixes":
      return scoreUpper(dice, 6);
    case "threeOfAKind":
      return scoreThreeOfAKind(dice);
    case "fourOfAKind":
      return scoreFourOfAKind(dice);
    case "fullHouse":
      return scoreFullHouse(dice);
    case "smallStraight":
      return scoreSmallStraight(dice);
    case "largeStraight":
      return scoreLargeStraight(dice);
    case "yams":
      return scoreYams(dice);
    case "chance":
      return scoreChance(dice);
  }
}

export function computeUpperBonus(card: ScoreCard): number {
  const upperTotal =
    (card.aces ?? 0) +
    (card.twos ?? 0) +
    (card.threes ?? 0) +
    (card.fours ?? 0) +
    (card.fives ?? 0) +
    (card.sixes ?? 0);
  return upperTotal >= 63 ? 35 : 0;
}

export function computeTotal(card: ScoreCard): number {
  const lower =
    (card.threeOfAKind ?? 0) +
    (card.fourOfAKind ?? 0) +
    (card.fullHouse ?? 0) +
    (card.smallStraight ?? 0) +
    (card.largeStraight ?? 0) +
    (card.yams ?? 0) +
    (card.chance ?? 0);
  const upper =
    (card.aces ?? 0) +
    (card.twos ?? 0) +
    (card.threes ?? 0) +
    (card.fours ?? 0) +
    (card.fives ?? 0) +
    (card.sixes ?? 0);
  return upper + computeUpperBonus(card) + lower;
}
