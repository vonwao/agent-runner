import { describe, expect, it } from 'vitest';
import { getNextAction } from './ai';
import { createInitialState, step, type Action } from '../engine/engine';
import type { GameState } from '../engine/types';

const MAX_STEPS = 50;

const isGameOver = (state: GameState) => state.player.hp <= 0 || state.enemy.hp <= 0;

const resolveAction = (state: GameState): Action =>
  getNextAction(state) ?? { type: 'end_turn' };

const simulateGame = (seed: number, maxSteps = MAX_STEPS) => {
  let state = createInitialState(seed);
  const actions: Action[] = [];
  let steps = 0;

  while (!isGameOver(state) && steps < maxSteps) {
    const action = resolveAction(state);
    actions.push(action);
    state = step(state, action);
    steps += 1;
  }

  return { actions, finalState: state, steps };
};

describe('ai', () => {
  it('produces the same actions for the same seed', () => {
    const firstRun = simulateGame(7);
    const secondRun = simulateGame(7);

    expect(secondRun.actions).toEqual(firstRun.actions);
  });

  it('plays the game to completion without looping forever', () => {
    const result = simulateGame(3);

    expect(isGameOver(result.finalState)).toBe(true);
    expect(result.steps).toBeLessThan(MAX_STEPS);
  });

  it('never selects a card it cannot afford', () => {
    const baseState = createInitialState(1);
    const state: GameState = {
      ...baseState,
      player: {
        ...baseState.player,
        energy: 0,
        deck: [],
        hand: [baseState.player.deck[0]],
        discard: []
      }
    };

    expect(getNextAction(state)).toBeNull();
  });
});
