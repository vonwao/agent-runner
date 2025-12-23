import type { Enemy, Player } from '../engine/types';
import { PlayerStats } from './PlayerStats';

interface BoardProps {
  player: Player;
  enemy: Enemy;
  onPlayCard?: (cardId: string) => void;
  disableActions?: boolean;
}

export function Board({ player, enemy, onPlayCard, disableActions = false }: BoardProps) {
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        width: 'min(100%, 980px)',
        margin: '0 auto',
        padding: '20px 16px 24px',
        background: 'linear-gradient(180deg, #f8fafc, #ffffff)',
        borderRadius: 18,
        border: '1px solid #e2e8f0'
      }}
    >
      <div
        style={{
          border: '1px solid #f59e0b',
          borderRadius: 16,
          padding: 16,
          background: 'linear-gradient(120deg, #fff7ed, #fef3c7)'
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 1,
            color: '#92400e',
            marginBottom: 8
          }}
        >
          Enemy Zone
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, color: '#78350f' }}>
          <div style={{ fontWeight: 600 }}>HP: {enemy.hp}</div>
          <div style={{ fontWeight: 600 }}>Intent: {enemy.intent}</div>
          <div style={{ fontWeight: 600 }}>Damage: {enemy.damage}</div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          alignItems: 'stretch',
          justifyContent: 'center'
        }}
      >
        <div
          style={{
            flex: '1 1 140px',
            minWidth: 140,
            border: '1px solid #64748b',
            borderRadius: 14,
            padding: 12,
            textAlign: 'center',
            background: 'linear-gradient(140deg, #e2e8f0, #f8fafc)'
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              color: '#334155',
              marginBottom: 10
            }}
          >
            Deck Pile
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#1e293b' }}>
            {player.deck.length}
          </div>
          <div style={{ fontSize: 12, color: '#475569' }}>cards remaining</div>
        </div>

        <PlayerStats hp={player.hp} energy={player.energy} block={player.block} />

        <div
          style={{
            flex: '1 1 140px',
            minWidth: 140,
            border: '1px solid #be123c',
            borderRadius: 14,
            padding: 12,
            textAlign: 'center',
            background: 'linear-gradient(140deg, #ffe4e6, #fff1f2)'
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              color: '#9f1239',
              marginBottom: 10
            }}
          >
            Discard Pile
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#881337' }}>
            {player.discard.length}
          </div>
          <div style={{ fontSize: 12, color: '#9f1239' }}>cards discarded</div>
        </div>
      </div>

      <div
        style={{
          border: '1px solid #0ea5e9',
          borderRadius: 16,
          padding: 16,
          background: 'linear-gradient(120deg, #e0f2fe, #f0f9ff)'
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 1,
            color: '#075985',
            marginBottom: 12
          }}
        >
          Hand Zone
        </div>
        {player.hand.length === 0 ? (
          <p style={{ margin: 0, color: '#0369a1' }}>(empty)</p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12
            }}
          >
            {player.hand.map((card) => (
              <div
                key={card.id}
                style={{
                  borderRadius: 12,
                  padding: 12,
                  border: '1px solid #38bdf8',
                  background: '#f8fafc',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}
              >
                <div style={{ fontWeight: 700, color: '#0f172a' }}>{card.name}</div>
                <div style={{ fontSize: 12, color: '#334155' }}>
                  Cost {card.cost} | Damage {card.damage}
                </div>
                {onPlayCard ? (
                  <button
                    type="button"
                    disabled={disableActions}
                    onClick={() => onPlayCard(card.id)}
                    style={{
                      borderRadius: 8,
                      border: '1px solid #0284c7',
                      background: disableActions ? '#e2e8f0' : '#0ea5e9',
                      color: disableActions ? '#64748b' : '#f8fafc',
                      padding: '6px 8px',
                      cursor: disableActions ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Play
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
