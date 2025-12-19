import { describe, expect, it } from 'vitest';
import { createInitialState, step } from './engine';

describe('engine', () => {
  it('draws a deterministic card', () => {
    const state = createInitialState(2);
    const next = step(state, { type: 'draw' });
    expect(next.player.hand).toHaveLength(1);
    expect(next.player.hand[0].id).toBe('strike-2');
  });

  it('plays a card and damages enemy', () => {
    const state = createInitialState(1);
    const drawn = step(state, { type: 'draw' });
    const card = drawn.player.hand[0];
    const afterPlay = step(drawn, { type: 'play_card', cardId: card.id });
    expect(afterPlay.enemy.hp).toBeLessThan(state.enemy.hp);
    expect(afterPlay.player.energy).toBe(state.player.energy - card.cost);
  });
});
