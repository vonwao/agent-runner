import { Action, GameState } from '../engine/types';

function selectBestPlayableCard(state: GameState): string | null {
  const { hand, energy } = state.player;
  let bestCardId: string | null = null;
  let bestDamage = -Infinity;
  let bestCost = Infinity;

  for (const card of hand) {
    if (card.cost > energy) {
      continue;
    }
    if (
      card.damage > bestDamage ||
      (card.damage === bestDamage && card.cost < bestCost) ||
      (card.damage === bestDamage && card.cost === bestCost && card.id < (bestCardId ?? ''))
    ) {
      bestCardId = card.id;
      bestDamage = card.damage;
      bestCost = card.cost;
    }
  }

  return bestCardId;
}

export function getNextAction(state: GameState): Action | null {
  if (state.player.hand.length < 3 && state.player.deck.length > 0) {
    return { type: 'draw' };
  }

  const bestCardId = selectBestPlayableCard(state);
  if (bestCardId) {
    return { type: 'play_card', cardId: bestCardId };
  }

  return null;
}
