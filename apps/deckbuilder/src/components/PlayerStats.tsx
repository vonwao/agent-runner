interface PlayerStatsProps {
  hp: number;
  energy: number;
  block: number;
  label?: string;
}

export function PlayerStats({ hp, energy, block, label = 'Player' }: PlayerStatsProps) {
  return (
    <section
      style={{
        border: '1px solid #9ca3af',
        borderRadius: 12,
        padding: 12,
        background: 'linear-gradient(140deg, #ecfdf3, #f8fafc)',
        minWidth: 200,
        boxShadow: '0 6px 14px rgba(15, 23, 42, 0.08)'
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: '#0f172a'
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 8,
          marginTop: 10
        }}
      >
        <div style={{ textAlign: 'center', padding: '6px 8px', borderRadius: 8, background: '#fef2f2' }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#991b1b' }}>HP</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#7f1d1d' }}>{hp}</div>
        </div>
        <div style={{ textAlign: 'center', padding: '6px 8px', borderRadius: 8, background: '#ecfeff' }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#0e7490' }}>Energy</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#155e75' }}>{energy}</div>
        </div>
        <div style={{ textAlign: 'center', padding: '6px 8px', borderRadius: 8, background: '#f1f5f9' }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#475569' }}>Block</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1f2937' }}>{block}</div>
        </div>
      </div>
    </section>
  );
}
