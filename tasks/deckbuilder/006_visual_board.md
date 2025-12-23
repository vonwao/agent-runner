# Task: Visual Board Layer

Transform the text-based UI into a visual board with distinct zones and styled card components.

## Current State
- Working game with persistence, replay, seed control
- AI autoplay with speed controls
- UI is functional but uses plain `<li>` text lists for cards
- All game logic works but lacks visual polish

## Requirements

### Milestone 1: Board Layout with Zones
- Create distinct visual zones: Enemy area, Hand zone, Deck pile, Discard pile
- Add compact Player stats panel (HP, Energy, Block)
- Zones should be clearly separated with visual boundaries
- Layout should be responsive and centered

### Milestone 2: Styled Card Components
- Create Card component with name, cost, damage displayed visually
- Cards show playable vs unplayable states (energy check)
- Unplayable cards appear dimmed or grayed
- Cards in hand are visually distinct from zone indicators

### Milestone 3: Click-to-Play Interaction
- Clicking a playable card plays it
- UI visibly reflects the move:
  - Card leaves hand zone
  - Discard count increments
  - Action log updates
  - Enemy HP updates if damage dealt
- Disabled during replay or autoplay modes

### Milestone 4: Integration Verification
- Verify persistence/export/import still works
- Verify replay controls still work with new UI
- Verify autoplay still works and updates UI correctly
- Add tests for new components and interactions

## Files Expected
- apps/deckbuilder/src/components/Card.tsx (new)
- apps/deckbuilder/src/components/Board.tsx (new)
- apps/deckbuilder/src/components/PlayerStats.tsx (new)
- apps/deckbuilder/src/components/Board.test.tsx (new)
- apps/deckbuilder/src/App.tsx (updated to use Board)

## Success Contract
1. `npm run dev` shows **distinct zones**: Enemy area, Hand, Deck pile, Discard pile, and a compact **player stats** panel.
2. Cards are **real components** (name/cost/effect) with **playable vs unplayable** visual states; no plain `<li>` list UI.
3. **Interaction:** click-to-play works and the UI visibly reflects the move (card leaves hand, discard count increments, log updates).
4. **No regressions:** **persistence/export/import/replay** and **autoplay** still work end-to-end with the new UI.
5. `npm test` passes with **≥5 new tests**: 2 UI (zones render + click-to-play), 2 determinism (seed+replay stable), 1 integration (autoplay doesn't break UI state).

## Scope
Only modify files in apps/deckbuilder/
