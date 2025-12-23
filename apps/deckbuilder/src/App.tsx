import { useRef, useState } from 'react';
import { getNextAction } from './ai/ai';
import { AutoPlayControls } from './components/AutoPlayControls';
import { createInitialState, step, Action } from './engine/engine';
import type { GameState } from './engine/types';

export default function App() {
  const [state, setState] = useState(() => createInitialState(1));
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [autoPlaySpeed, setAutoPlaySpeed] = useState(300);
  const autoPlayStopRef = useRef(false);

  const dispatch = (action: Action) => {
    setState((current) => step(current, action));
  };

  const describeAction = (action: Action, currentState: GameState) => {
    switch (action.type) {
      case 'draw':
        return 'AI draws a card';
      case 'play_card': {
        const card = currentState.player.hand.find(
          (handCard) => handCard.id === action.cardId
        );
        if (card) {
          return `AI plays ${card.name} (cost ${card.cost}, dmg ${card.damage})`;
        }
        return `AI plays card ${action.cardId}`;
      }
      case 'end_turn':
        return 'AI ends the turn';
      default:
        return 'AI waits';
    }
  };

  const pushActionLog = (entry: string) => {
    setActionLog((prev) => {
      const next = [...prev, entry];
      return next.length > 8 ? next.slice(next.length - 8) : next;
    });
  };

  const autoPlayGame = async () => {
    if (isAutoPlaying) {
      return;
    }
    if (state.player.hp <= 0 || state.enemy.hp <= 0) {
      return;
    }
    setIsAutoPlaying(true);
    setActionLog([]);
    autoPlayStopRef.current = false;
    let currentState = state;
    try {
      while (true) {
        if (
          autoPlayStopRef.current ||
          currentState.player.hp <= 0 ||
          currentState.enemy.hp <= 0
        ) {
          break;
        }
        const nextAction = getNextAction(currentState);
        const action = nextAction ?? { type: 'end_turn' as const };
        pushActionLog(describeAction(action, currentState));
        const nextState = step(currentState, action);
        currentState = nextState;
        setState(nextState);
        await new Promise((resolve) => setTimeout(resolve, autoPlaySpeed));
      }
    } finally {
      autoPlayStopRef.current = false;
      setIsAutoPlaying(false);
    }
  };

  const stopAutoPlay = () => {
    autoPlayStopRef.current = true;
  };

  const isGameOver = state.player.hp <= 0 || state.enemy.hp <= 0;

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 24 }}>
      <h1>Deckbuilder Prototype</h1>
      <section style={{ marginBottom: 16 }}>
        <h2>Player</h2>
        <p>HP: {state.player.hp}</p>
        <p>Energy: {state.player.energy}</p>
      </section>
      <section style={{ marginBottom: 16 }}>
        <h2>Enemy</h2>
        <p>HP: {state.enemy.hp}</p>
        <p>Intent: {state.enemy.intent}</p>
      </section>
      <section style={{ marginBottom: 16 }}>
        <h2>Hand</h2>
        {state.player.hand.length === 0 ? (
          <p>(empty)</p>
        ) : (
          <ul>
            {state.player.hand.map((card) => (
              <li key={card.id}>
                {card.name} (cost {card.cost}, dmg {card.damage}){' '}
                <button
                  type="button"
                  disabled={isAutoPlaying}
                  onClick={() => dispatch({ type: 'play_card', cardId: card.id })}
                >
                  Play
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            disabled={isAutoPlaying}
            onClick={() => dispatch({ type: 'draw' })}
          >
            Draw
          </button>
          <button
            type="button"
            disabled={isAutoPlaying}
            onClick={() => dispatch({ type: 'end_turn' })}
          >
            End Turn
          </button>
        </div>
        <AutoPlayControls
          isAutoPlaying={isAutoPlaying}
          actionLog={actionLog}
          autoPlaySpeed={autoPlaySpeed}
          turn={state.turn}
          isGameOver={isGameOver}
          onAutoPlayGame={autoPlayGame}
          onStopAutoPlay={stopAutoPlay}
          onSpeedChange={setAutoPlaySpeed}
        />
      </section>
    </main>
  );
}
