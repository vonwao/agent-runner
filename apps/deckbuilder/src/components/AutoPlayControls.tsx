interface AutoPlayControlsProps {
  isAutoPlaying: boolean;
  actionLog: string[];
  autoPlaySpeed: number;
  turn: number;
  isGameOver: boolean;
  onAutoPlayGame: () => void;
  onStopAutoPlay: () => void;
  onSpeedChange: (speed: number) => void;
}

export function AutoPlayControls({
  isAutoPlaying,
  actionLog,
  autoPlaySpeed,
  turn,
  isGameOver,
  onAutoPlayGame,
  onStopAutoPlay,
  onSpeedChange
}: AutoPlayControlsProps) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 220 }}>
      <button
        type="button"
        onClick={onAutoPlayGame}
        disabled={isAutoPlaying || isGameOver}
      >
        Auto-Play Game
      </button>
      {isAutoPlaying ? (
        <button type="button" onClick={onStopAutoPlay}>
          Stop Auto-Play
        </button>
      ) : null}
      {isAutoPlaying ? (
        <div style={{ fontSize: 12, color: '#333' }}>Auto-play turn: {turn}</div>
      ) : null}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
        Speed
        <select
          value={autoPlaySpeed}
          disabled={isAutoPlaying}
          onChange={(event) => onSpeedChange(Number(event.target.value))}
        >
          <option value={500}>Slow (500ms)</option>
          <option value={300}>Normal (300ms)</option>
          <option value={100}>Fast (100ms)</option>
        </select>
      </label>
      <div style={{ border: '1px solid #ddd', borderRadius: 6, padding: 8 }}>
        <strong style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>AI Actions</strong>
        {actionLog.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: '#666' }}>(no actions yet)</p>
        ) : (
          <ol style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
            {actionLog.map((entry, index) => (
              <li key={`${entry}-${index}`}>{entry}</li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
