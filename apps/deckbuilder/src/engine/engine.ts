import { starterDeck } from './cards';
import { nextInt } from './rng';
import { Action, Card, GameState } from './types';

export function createInitialState(seed: number): GameState {
  return {
    turn: 1,
    rng: { seed },
    player: {
      hp: 40,
      energy: 3,
      deck: [...starterDeck],
      hand: [],
      discard: []
    },
    enemy: {
      hp: 30,
      intent: 'attack',
      damage: 5
    }
  };
}

function drawCard(state: GameState): GameState {
  if (state.player.deck.length === 0) {
    return state;
  }
  const { value, rng } = nextInt(state.rng, state.player.deck.length);
  const deck = [...state.player.deck];
  const [card] = deck.splice(value, 1);
  return {
    ...state,
    rng,
    player: {
      ...state.player,
      deck,
      hand: [...state.player.hand, card]
    }
  };
}

function playCard(state: GameState, card: Card): GameState {
  if (state.player.energy < card.cost) {
    return state;
  }
  return {
    ...state,
    player: {
      ...state.player,
      energy: state.player.energy - card.cost,
      hand: state.player.hand.filter((handCard) => handCard.id !== card.id),
      discard: [...state.player.discard, card]
    },
    enemy: {
      ...state.enemy,
      hp: Math.max(0, state.enemy.hp - card.damage)
    }
  };
}

function enemyTurn(state: GameState): GameState {
  if (state.enemy.intent === 'attack') {
    return {
      ...state,
      player: {
        ...state.player,
        hp: Math.max(0, state.player.hp - state.enemy.damage)
      }
    };
  }
  return state;
}

export function step(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'draw':
      return drawCard(state);
    case 'play_card': {
      const card = state.player.hand.find((handCard) => handCard.id === action.cardId);
      if (!card) {
        return state;
      }
      return playCard(state, card);
    }
    case 'end_turn': {
      const afterEnemy = enemyTurn(state);
      return {
        ...afterEnemy,
        turn: afterEnemy.turn + 1,
        player: {
          ...afterEnemy.player,
          energy: 3,
          hand: []
        }
      };
    }
    default:
      return state;
  }
}

export type { Action } from './types';
