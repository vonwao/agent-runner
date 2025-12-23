# Task: Intuitive Game Feel

Transform the functional UI into an intuitive, game-like experience. No business dashboards - this should look and feel like a card game.

## Current State
- Board has zones but looks like a debug panel
- Cards display data but don't look like cards
- Health/energy shown as plain numbers
- Enemy intent is just text
- No visual feedback on actions

## Design Principles
- **Game, not dashboard**: Rich colors, card aesthetics, game-like feel
- **Zero instructions needed**: Layout and visuals should be self-explanatory
- **Cards look like cards**: Rounded corners, card proportions, visual hierarchy of name/cost/effect
- **Immediate feedback**: Every action has visible consequence

## Requirements

### Milestone 1: Game Layout
- Enemy zone at TOP (like opponent across table) with health bar and intent
- Player zone at BOTTOM with health bar and energy pips/bar
- Hand cards displayed in arc or spread formation between zones
- Deck shown as stack of card backs, discard as pile
- Dark or themed background - not white/gray business look

### Milestone 2: Card Aesthetics
- Cards have card-like proportions (poker card ratio ~2.5:3.5)
- Rounded corners, subtle shadow/border
- Clear visual hierarchy: cost in corner, name prominent, damage/effect below
- Playable cards: elevated, glowing border or highlight
- Unplayable cards: desaturated, flat, obviously disabled
- Hover state: card lifts/scales up slightly

### Milestone 3: Health & Intent Visualization
- Health as colored bars (green→yellow→red as damage taken), not just numbers
- Energy as pips or segmented bar, not plain number
- Enemy intent: icon-based (⚔️ sword for attack, 🛡️ shield for defend) with damage number
- Intent should be immediately readable at a glance

### Milestone 4: Action Feedback
- Playing a card: brief animation or transition (card moves toward enemy/center)
- Damage dealt: number pops up on enemy, health bar animates down
- Turn end: visual indication that enemy is acting
- Enemy attack: flash or shake on player, health bar drops

### Milestone 5: Polish & Verification
- Verify all existing features still work (persistence, replay, autoplay)
- Game should be understandable without any text instructions
- All tests pass

## Files Expected
- apps/deckbuilder/src/components/Card.tsx (updated)
- apps/deckbuilder/src/components/Board.tsx (updated)
- apps/deckbuilder/src/components/HealthBar.tsx (new)
- apps/deckbuilder/src/components/EnemyIntent.tsx (new)
- apps/deckbuilder/src/styles/ or inline styles (updated)
- apps/deckbuilder/src/App.tsx (minor updates if needed)

## Success Contract
1. **Spatial layout**: Enemy at top, player at bottom, hand cards in spread/arc formation
2. **Cards look like cards**: Card proportions, rounded corners, shadow - not table rows or boxes
3. **Visual health/energy**: Bars that animate, not plain numbers (numbers can supplement but bars are primary)
4. **Icon-based intent**: Enemy shows ⚔️/🛡️ style icons, readable at a glance
5. **No regressions**: Persistence, replay, autoplay all still work; all tests pass

## Anti-patterns to Avoid
- White/gray backgrounds with black text (business look)
- Data displayed in tables or grids
- Plain text for game state ("HP: 50", "Intent: attack")
- Cards that look like buttons or list items
- No visual response to user actions

## Scope
Only modify files in apps/deckbuilder/
