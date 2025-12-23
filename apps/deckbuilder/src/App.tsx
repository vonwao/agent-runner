import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { createInitialState, step, Action } from './engine/engine';
import { usePersistence } from './hooks/usePersistence';
import { deserializeExport, serializeExport } from './utils/serialization';

export default function App() {
  const {
    state,
    setState,
    autoSaveEnabled,
    setAutoSaveEnabled,
    clearSavedState
  } = usePersistence(() => createInitialState(1));
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const dispatch = (action: Action) => {
    setState((current) => step(current, action));
  };

  const startNewGame = () => {
    setImportError(null);
    clearSavedState();
    setState(() => createInitialState(1));
  };

  const handleExport = () => {
    const payload = serializeExport(state);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'deckbuilder-save.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    setImportError(null);
    fileInputRef.current?.click();
  };

  const handleImportChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const nextState = deserializeExport(text);
      if (!nextState) {
        setImportError('Invalid save file. Please check the JSON and try again.');
        return;
      }
      setImportError(null);
      setState(nextState);
    } catch {
      setImportError('Unable to read the selected file.');
    } finally {
      event.target.value = '';
    }
  };

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 24 }}>
      <h1>Deckbuilder Prototype</h1>
      <section
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 16
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={autoSaveEnabled}
            onChange={(event) => setAutoSaveEnabled(event.target.checked)}
          />
          Auto-save
        </label>
        <button type="button" onClick={startNewGame}>
          New Game
        </button>
        <button type="button" onClick={handleExport}>
          Export
        </button>
        <button type="button" onClick={handleImportClick}>
          Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          onChange={handleImportChange}
          style={{ display: 'none' }}
        />
      </section>
      {importError ? (
        <p style={{ color: '#b91c1c', marginBottom: 16 }} role="alert">
          {importError}
        </p>
      ) : null}
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
                  onClick={() => dispatch({ type: 'play_card', cardId: card.id })}
                >
                  Play
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section style={{ display: 'flex', gap: 12 }}>
        <button type="button" onClick={() => dispatch({ type: 'draw' })}>
          Draw
        </button>
        <button type="button" onClick={() => dispatch({ type: 'end_turn' })}>
          End Turn
        </button>
      </section>
      <section style={{ marginTop: 16 }}>
        <h2>Action Log</h2>
        <p>Total actions: {state.actionLog.length}</p>
        {state.actionLog.length === 0 ? (
          <p>(no actions yet)</p>
        ) : (
          <ol>
            {state.actionLog.map((action, index) => (
              <li key={`${action.type}-${index}`}>
                {action.type === 'play_card'
                  ? `play_card (${action.cardId})`
                  : action.type}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
