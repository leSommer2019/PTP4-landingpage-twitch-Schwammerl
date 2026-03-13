interface BeardProps {
  bartLength: number;
  clickCount?: number;
}

export function BeardSVG({ bartLength, clickCount = 0 }: BeardProps) {
  // Bartgröße basierend auf Klicks (max 150% größer)
  const clickScale = Math.min(1.5, 1 + clickCount * 0.01);
  const svgWidth = 100 * clickScale;
  const svgHeight = 120 * clickScale;

  return (
    <svg 
      viewBox="0 0 100 120" 
      xmlns="http://www.w3.org/2000/svg" 
      className="beard-svg"
      style={{ 
        width: svgWidth, 
        height: svgHeight,
        transition: 'all 0.2s ease'
      }}
    >
      <defs>
        <linearGradient id="beardGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#2a1f15', stopOpacity: 1 }} />
          <stop offset="50%" style={{ stopColor: '#3d2b1f', stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: '#1a0f0a', stopOpacity: 1 }} />
        </linearGradient>
      </defs>
      
      {/* Oberteil des Barts */}
      <path
        d={`M 20 30 Q 50 35 80 30 Q 85 40 80 ${50 + bartLength * 0.15} Q 50 ${55 + bartLength * 0.15} 20 ${50 + bartLength * 0.15} Q 15 40 20 30 Z`}
        fill="url(#beardGrad)"
        style={{ transition: 'all 0.2s ease' }}
      />
      
      {/* Bart-Feinstruktur - einzelne Haare */}
      <g stroke="#2a1f15" strokeWidth="1.2" opacity="0.5" strokeLinecap="round">
        <path d={`M 30 35 Q 28 ${55 + bartLength * 0.1} 32 ${65 + bartLength * 0.12}`} />
        <path d={`M 45 32 Q 44 ${60 + bartLength * 0.12} 46 ${72 + bartLength * 0.15}`} />
        <path d={`M 50 30 Q 50 ${62 + bartLength * 0.15} 50 ${76 + bartLength * 0.18}`} />
        <path d={`M 55 32 Q 56 ${60 + bartLength * 0.12} 54 ${72 + bartLength * 0.15}`} />
        <path d={`M 70 35 Q 72 ${55 + bartLength * 0.1} 68 ${65 + bartLength * 0.12}`} />
      </g>
      
      {/* Ganz unten - wirkt lockig/buschig */}
      <ellipse
        cx="50"
        cy={`${75 + bartLength * 0.18}`}
        rx={`${25 + bartLength * 0.05}`}
        ry={`${10 + bartLength * 0.08}`}
        fill="#2a1f15"
        opacity="0.7"
      />
    </svg>
  );
}

