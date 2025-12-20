import { describe, expect, it } from 'vitest';
import { applyDamage, createInitialState, step } from './engine';

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

  it('applies damage to block before hp and floors at 0', () => {
    const target = { hp: 10, block: 5 };
    const reduced = applyDamage(target, 7);
    expect(reduced.block).toBe(0);
    expect(reduced.hp).toBe(8);

    const floored = applyDamage(target, 20);
    expect(floored.block).toBe(0);
    expect(floored.hp).toBe(0);
  });
});
