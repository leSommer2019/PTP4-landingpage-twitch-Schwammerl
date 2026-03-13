interface BeardProps {
  bartLength: number;
  clickCount?: number;
}

export function BeardSVG({ bartLength, clickCount = 0 }: BeardProps) {
  // Bartgröße basierend auf Rebirths (bartLength von 50 bis 100)
  // Normalisiere bartLength auf eine Prozentquote (50-100 → 0-1)
  const bartGrowth = (bartLength - 50) / 50; // 0 bis 1
  
  // Dynamische Bart-Höhe: von Basis bis zu extremem Wachstum
  const beardHeight = Math.min(200, 20 + bartGrowth * 150);
  
  // Skalierung basierend auf Klicks
  const clickScale = Math.min(1.5, 1 + clickCount * 0.01);
  const svgWidth = 120 * clickScale;
  const svgHeight = 240 * clickScale;

  return (
    <svg 
      id="avatar-svg" 
      viewBox="0 0 100 200" 
      xmlns="http://www.w3.org/2000/svg"
      className="beard-svg"
      style={{ 
        width: svgWidth, 
        height: svgHeight,
        transition: 'all 0.2s ease'
      }}
    >
      {/* Kopf */}
      <rect x="30" y="30" width="40" height="35" rx="6" fill="#d4a373"/>

      {/* CAP (SNAPBACK) */}
      <g id="cap">
        {/* Schirm */}
        <rect x="25" y="32" width="50" height="5" rx="2" fill="#7C4DFF"/>
        {/* Amulett */}
        <path d="M30 32 L70 32 L70 25 Q 50 15 30 25 Z" fill="#7C4DFF"/>
        {/* Kleiner Knopf oben */}
        <circle cx="50" cy="18" r="2" fill="#5c38cc"/>
        {/* Rebirth Badge (hidden by default) */}
        <g id="rebirth-badge" style={{ display: 'none' }}>
          <circle cx="65" cy="20" r="6" fill="#FFD700" stroke="#FFA500" strokeWidth="1"/>
          <text x="65" y="23" fontSize="8" fontWeight="bold" fill="#000" textAnchor="middle" fontFamily="Arial">
            ♻
          </text>
        </g>
      </g>

      {/* Brille */}
      <g stroke="#111" strokeWidth="1.2" fill="none">
        <rect x="34" y="42" width="10" height="7" rx="1"/>
        <rect x="56" y="42" width="10" height="7" rx="1"/>
        <path d="M44 46 h12"/>
      </g>

      {/* Augen */}
      <circle cx="39" cy="45" r="1" fill="#000"/>
      <circle cx="61" cy="45" r="1" fill="#000"/>

      {/* DYNAMISCHER BART */}
      <g id="beard-group" style={{ transition: 'all 0.2s ease' }}>
        {/* Basis-Beard (dynamisch wachsend) */}
        <path 
          id="beard-path" 
          d={`M30 60 Q 50 60 70 60 L 70 ${60 + beardHeight * 0.3} Q 50 ${60 + beardHeight * 0.4} 30 ${60 + beardHeight * 0.3} Z`}
          fill="#3d2b1f"
          fillRule="evenodd"
          style={{ transition: 'all 0.2s ease' }}
        />

        {/* Haarstruktur: stroke-only Kopie des Pfades */}
        <path 
          id="beard-hair" 
          d={`M30 60 Q 50 60 70 60 L 70 ${60 + beardHeight * 0.3} Q 50 ${60 + beardHeight * 0.4} 30 ${60 + beardHeight * 0.3} Z`}
          fill="none" 
          stroke="#22160f"
          strokeWidth="0.9" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeDasharray="2 4"
          opacity="0.85" 
          pointerEvents="none"
          style={{ transition: 'all 0.2s ease' }}
        />

        {/* Subtiler Outline für Tiefe */}
        <path 
          id="beard-outline" 
          d={`M30 60 Q 50 60 70 60 L 70 ${60 + beardHeight * 0.3} Q 50 ${60 + beardHeight * 0.4} 30 ${60 + beardHeight * 0.3} Z`}
          fill="none" 
          stroke="#000"
          strokeWidth="0.6" 
          opacity="0.12" 
          pointerEvents="none"
          style={{ transition: 'all 0.2s ease' }}
        />
      </g>

      {/* Event decorations (hidden by default) */}
      <g id="beard-clover" style={{ display: 'none' }}>
        <text x="50" y="70" fontSize="12" fill="#00FF00" textAnchor="middle" fontFamily="Arial">🍀</text>
      </g>
    </svg>
  );
}

