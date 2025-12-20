# Task 002: Card Effects and Draw Mechanics

Goal: Expand the card system with multiple effect types and proper draw/discard cycling.

## Requirements

### 1. Card Effect Types
Extend the Card interface to support different effect types:
- `damage`: Deal damage to enemy (existing)
- `block`: Add block to player
- `draw`: Draw additional cards

Each card should have an `effects` array instead of just `damage`:
```typescript
interface CardEffect {
  type: 'damage' | 'block' | 'draw';
  value: number;
}

interface Card {
  id: string;
  name: string;
  cost: number;
  effects: CardEffect[];
}
```

### 2. Starter Deck Update
Replace the current starter deck with:
- Strike (cost 1): deal 6 damage
- Defend (cost 1): gain 5 block
- Bash (cost 2): deal 8 damage, gain 3 block
- Quick Draw (cost 0): draw 2 cards

### 3. Draw Mechanics
- `drawCards(state, count)`: Draw `count` cards from deck to hand
- When deck is empty and draw is needed: shuffle discard into deck, then draw
- Reshuffle must use the deterministic RNG
- Hand has no size limit for now

### 4. Turn Start
Modify `end_turn` to also handle turn start for the next turn:
- Reset block to 0 at start of turn
- Draw 5 cards at start of turn
- Reset energy to 3

### 5. Apply Card Effects
When a card is played, apply all its effects in order:
- `damage`: call applyDamage on enemy
- `block`: add value to player.block
- `draw`: call drawCards

## Tests Required
1. Playing a block card increases player.block
2. Playing a draw card adds cards to hand
3. Multi-effect card (Bash) applies both damage and block
4. When deck is empty, discard reshuffles into deck deterministically
5. Turn start draws 5 cards and resets block to 0
6. Drawing more cards than deck+discard handles gracefully (draws what's available)

## Acceptance
- `npm run lint`
- `npm run typecheck`
- `npm run test` (all new + existing tests pass)

## Files Expected
- src/engine/types.ts (Card, CardEffect interfaces)
- src/engine/cards.ts (new starter deck)
- src/engine/engine.ts (drawCards, effect application, turn mechanics)
- src/engine/engine.test.ts (6 new tests)
