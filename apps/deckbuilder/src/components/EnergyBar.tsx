import { CSSProperties, useEffect, useState } from 'react';

interface EnergyBarProps {
  current: number;
  max: number;
  showLabel?: boolean;
}

export function EnergyBar({ current, max, showLabel = true }: EnergyBarProps) {
  const [prevCurrent, setPrevCurrent] = useState(current);
  const [animatingPip, setAnimatingPip] = useState<number | null>(null);

  useEffect(() => {
    if (prevCurrent !== current) {
      // Animate the pip that changed
      if (current < prevCurrent) {
        // Energy was spent - animate the pip that was just emptied
        setAnimatingPip(current);
      } else {
        // Energy was gained - animate the pip that was just filled
        setAnimatingPip(current - 1);
      }
      setPrevCurrent(current);
      const timeout = setTimeout(() => setAnimatingPip(null), 300);
      return () => clearTimeout(timeout);
    }
  }, [current, prevCurrent]);

  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    width: '100%'
  };

  const labelStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 11,
    fontWeight: 600
  };

  const pipsContainerStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
    gap: 6
  };

  const pips = [];
  for (let i = 0; i < max; i++) {
    const isFilled = i < current;
    const isAnimating = animatingPip === i;

    const pipStyle: CSSProperties = {
      width: 24,
      height: 24,
      borderRadius: '50%',
      border: `2px solid ${isFilled ? '#06b6d4' : 'rgba(103, 232, 249, 0.3)'}`,
      background: isFilled
        ? 'linear-gradient(135deg, #22d3ee 0%, #06b6d4 50%, #0891b2 100%)'
        : 'rgba(0, 0, 0, 0.3)',
      boxShadow: isFilled
        ? '0 0 12px rgba(6, 182, 212, 0.6), inset 0 1px 0 rgba(255,255,255,0.3)'
        : 'inset 0 2px 4px rgba(0,0,0,0.3)',
      transition: 'all 200ms ease-out',
      transform: isAnimating ? 'scale(1.2)' : 'scale(1)',
      position: 'relative' as const,
      overflow: 'hidden'
    };

    const shimmerStyle: CSSProperties = {
      position: 'absolute',
      top: 2,
      left: 4,
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: isFilled
        ? 'radial-gradient(circle, rgba(255,255,255,0.5) 0%, transparent 70%)'
        : 'none',
      opacity: isFilled ? 1 : 0,
      transition: 'opacity 200ms ease-out'
    };

    pips.push(
      <div key={i} style={pipStyle}>
        <div style={shimmerStyle} />
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {showLabel && (
        <div style={labelStyle}>
          <span style={{ color: '#67e8f9', textTransform: 'uppercase', letterSpacing: 1 }}>
            Energy
          </span>
          <span style={{ color: '#ecfeff' }}>
            {current} / {max}
          </span>
        </div>
      )}
      <div style={pipsContainerStyle}>{pips}</div>
    </div>
  );
}
