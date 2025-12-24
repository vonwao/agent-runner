# Task: Compact UI Polish

Make the UI tight, focused, and fit comfortably on screen. Currently the layout is too spread out with scattered controls and wasted space.

## Current Problems (from screenshot)

1. **Replay bar too prominent** - Full-width bar showing "Progress: 0/0" even when not replaying
2. **Too much vertical spacing** - Large gaps between enemy zone, hand, and player zone
3. **Controls scattered everywhere** - Top-left has auto-save/export, bottom-left has draw/end turn/AI log
4. **AI Actions log visible by default** - Debug-style list taking prime real estate
5. **Empty hand wastes space** - "YOUR HAND (empty)" still takes vertical room
6. **Doesn't fit viewport** - Requires scrolling to see everything

## Design Goals

- **Single viewport** - Entire game visible without scrolling on a typical laptop screen (assume 900px height max)
- **No scrolling ever** - If it doesn't fit, use a popup/modal instead
- **Popups over panels** - Secondary features (export, import, replay, settings) belong in modals, not always-visible sections
- **Progressive disclosure** - Show only what's needed for current action, reveal more on demand
- **Focus on gameplay** - Board is the star, everything else is accessible but not competing for attention

## Requirements

### Milestone 1: Compact Game Board
- Reduce padding/margins in enemy zone, hand zone, player zone
- Tighten vertical spacing - zones should feel connected, not floating islands
- Board should be max ~600px tall total (enemy + hand + player)
- Hand zone: when empty, just show minimal placeholder, not big empty area

### Milestone 2: Integrated Controls
- Move Draw/End Turn buttons INTO the player zone (near energy/HP)
- Auto-Play button near the action buttons, not separate
- Remove the floating bottom-left control panel
- Speed selector: small dropdown or icons, not prominent

### Milestone 3: Popups for Secondary Features
- **Export/Import**: Open in a modal dialog, not visible in main UI
- **Replay controls**: Only show small "▶ Replay" button if replay is available; controls appear in modal or overlay when active
- **AI Actions log**: Move to a popup/tooltip on hover or click, not always visible
- **Settings/options**: If needed, put in a gear icon menu or modal
- Use a simple Modal component pattern (overlay + centered dialog)

### Milestone 4: Minimal Header
- Single row: Game title left, essential icons right (☰ menu for Export/Import/Settings, auto-save indicator)
- New Game button can stay visible (primary action)
- No more than ~40px header height
- Menu icon opens modal with secondary options

### Milestone 5: Final Polish
- Verify everything fits in ~900px viewport height without scrolling
- All features still work (persistence, replay when active, autoplay)
- All tests pass

## Visual Targets

**Main View (always visible, no scroll):**
```
┌─────────────────────────────────────────┐
│  Deckbuilder        [New Game] [☰] [●]  │  <- 40px header (● = auto-save on)
├─────────────────────────────────────────┤
│                                         │
│       ENEMY   HP ████░░░░   ⚔️ 6        │  <- Enemy (compact, inline)
│                                         │
│    [Card1] [Card2] [Card3] [Card4]      │  <- Hand (cards in row)
│                                         │
│  ┌────┐     HP ██████████ 40/40  ┌────┐ │
│  │DECK│     ⚡⚡⚡  🛡️ 0          │DISC│ │  <- Player + deck/discard
│  │ 5  │                          │ 2  │ │
│  └────┘  [Draw] [End] [▶Auto]    └────┘ │  <- Actions inline
└─────────────────────────────────────────┘
          Total height: ~500px max
```

**Menu Modal (☰ click):**
```
┌─────────────────────┐
│      Game Menu      │
├─────────────────────┤
│  📁 Export Save     │
│  📂 Import Save     │
│  ▶️ Replay Game     │  <- Only if replay available
│  ⚙️ Settings        │
└─────────────────────┘
```

**Replay Mode (overlay on game):**
```
┌─────────────────────────────────────────┐
│  ▶ Playing action 3/15   [⏸] [⏹]       │  <- Floating bar at top
│  ─────────────────●───────────────────  │
└─────────────────────────────────────────┘
```

## Anti-Patterns to Avoid
- Full-width bars for secondary features (replay progress)
- Controls floating outside the game board
- Debug-style lists visible by default
- Giant padding/margins between zones
- Scrolling required to see basic game state

## Files to Modify
- apps/deckbuilder/src/components/Board.tsx (layout, integrate controls)
- apps/deckbuilder/src/components/PlayerStats.tsx (compact)
- apps/deckbuilder/src/components/Card.tsx (sizing if needed)
- apps/deckbuilder/src/components/Modal.tsx (new - reusable modal)
- apps/deckbuilder/src/components/GameMenu.tsx (new - menu modal content)
- apps/deckbuilder/src/components/ReplayControls.tsx (convert to overlay)
- apps/deckbuilder/src/components/AutoPlayControls.tsx (compact inline)
- apps/deckbuilder/src/App.tsx (wire up modals, remove scattered controls)

## Success Contract
1. **Fits viewport**: Game board ≤500px tall, total page ≤600px, no scrolling needed
2. **Controls integrated**: Draw/End Turn/Auto-play all inside the game board area
3. **Popup pattern**: Export/Import/Replay accessed via menu modal, not always visible
4. **No floating panels**: No controls outside the main game board (no bottom-left panel)
5. **No regressions**: All 44 tests pass, all features accessible (some via modals)

## Scope
Only modify files in apps/deckbuilder/
