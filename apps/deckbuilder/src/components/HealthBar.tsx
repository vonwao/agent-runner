import { CSSProperties, useEffect, useState } from 'react';

interface HealthBarProps {
  current: number;
  max: number;
  showLabel?: boolean;
  size?: 'small' | 'medium' | 'large';
}

function getHealthColor(ratio: number): string {
  if (ratio > 0.6) {
    return '#22c55e'; // green
  }
  if (ratio > 0.3) {
    return '#eab308'; // yellow
  }
  return '#ef4444'; // red
}

function getHealthGlow(ratio: number): string {
  if (ratio > 0.6) {
    return 'rgba(34, 197, 94, 0.4)';
  }
  if (ratio > 0.3) {
    return 'rgba(234, 179, 8, 0.4)';
  }
  return 'rgba(239, 68, 68, 0.4)';
}

export function HealthBar({ current, max, showLabel = true, size = 'medium' }: HealthBarProps) {
  const [displayValue, setDisplayValue] = useState(current);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (displayValue !== current) {
      setIsAnimating(true);
      const timeout = setTimeout(() => {
        setDisplayValue(current);
        setIsAnimating(false);
      }, 50);
      return () => clearTimeout(timeout);
    }
  }, [current, displayValue]);

  const ratio = Math.max(0, Math.min(1, current / max));
  const displayRatio = Math.max(0, Math.min(1, displayValue / max));
  const color = getHealthColor(ratio);
  const glow = getHealthGlow(ratio);

  const heights = {
    small: 8,
    medium: 12,
    large: 16
  };

  const heights_value = heights[size];

  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    width: '100%'
  };

  const barContainerStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    height: heights_value,
    background: 'rgba(0, 0, 0, 0.4)',
    borderRadius: heights_value / 2,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    overflow: 'hidden'
  };

  const fillStyle: CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    width: `${displayRatio * 100}%`,
    background: `linear-gradient(90deg, ${color}, ${color}dd)`,
    borderRadius: heights_value / 2,
    boxShadow: `0 0 8px ${glow}, inset 0 1px 0 rgba(255,255,255,0.3)`,
    transition: 'width 300ms ease-out, background 300ms ease-out, box-shadow 300ms ease-out',
    transform: isAnimating ? 'scaleX(0.98)' : 'scaleX(1)',
    transformOrigin: 'left'
  };

  const shimmerStyle: CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 100%)',
    borderRadius: `${heights_value / 2}px ${heights_value / 2}px 0 0`
  };

  const labelStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: size === 'small' ? 10 : 11,
    fontWeight: 600
  };

  return (
    <div style={containerStyle}>
      {showLabel && (
        <div style={labelStyle}>
          <span style={{ color: '#fca5a5', textTransform: 'uppercase', letterSpacing: 1 }}>HP</span>
          <span style={{ color: '#fef2f2' }}>
            {current} / {max}
          </span>
        </div>
      )}
      <div style={barContainerStyle}>
        <div style={fillStyle} />
        <div style={shimmerStyle} />
      </div>
    </div>
  );
}
