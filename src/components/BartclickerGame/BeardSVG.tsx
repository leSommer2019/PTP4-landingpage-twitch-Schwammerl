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
  
  // Skalierung basierend auf Klicks - NUR für Bart, nicht für Kopf
  const clickScale = Math.min(1.5, 1 + clickCount * 0.01);
  
  // SVG-Höhe: Base + Bartgröße, aber Breite bleibt konstant
  const svgHeight = 800 + beardHeight * 0.9;

  return (
    <svg 
      id="avatar-svg" 
      viewBox="0 0 100 350" 
      xmlns="http://www.w3.org/2000/svg"
      className="beard-svg"
      style={{ 
        width: 180, 
        height: svgHeight,
        transition: 'all 0.2s ease'
      }}
    >
      {/* Kopf - VERGRÖSSERT */}
      <rect x="20" y="20" width="60" height="50" rx="8" fill="#d4a373"/>

      {/* CAP (SNAPBACK) - VERGRÖSSERT */}
      <g id="cap">
        {/* Schirm */}
        <rect x="15" y="22" width="70" height="7" rx="3" fill="#7C4DFF"/>
        {/* Amulett */}
        <path d="M20 22 L80 22 L80 12 Q 50 0 20 12 Z" fill="#7C4DFF"/>
        {/* Kleiner Knopf oben */}
        <circle cx="50" cy="2" r="3" fill="#5c38cc"/>
        {/* Rebirth Badge (hidden by default) */}
        <g id="rebirth-badge" style={{ display: 'none' }}>
          <circle cx="75" cy="12" r="8" fill="#FFD700" stroke="#FFA500" strokeWidth="1.5"/>
          <text x="75" y="16" fontSize="10" fontWeight="bold" fill="#000" textAnchor="middle" fontFamily="Arial">
            ♻
          </text>
        </g>
      </g>

      {/* Brille - VERGRÖSSERT */}
      <g stroke="#111" strokeWidth="1.5" fill="none">
        <rect x="28" y="48" width="15" height="10" rx="2"/>
        <rect x="57" y="48" width="15" height="10" rx="2"/>
        <path d="M43 53 h14"/>
      </g>

      {/* Augen - VERGRÖSSERT */}
      <circle cx="35" cy="53" r="1.5" fill="#000"/>
      <circle cx="65" cy="53" r="1.5" fill="#000"/>

      {/* DYNAMISCHER BART - WIRD MIT KLICKS SKALIERT */}
      <g 
        id="beard-group" 
        style={{ 
          transition: 'all 0.2s ease',
          transform: `scale(${clickScale})`,
          transformOrigin: 'center bottom',
          transformBox: 'fill-box'
        }}
      >
        {/* Basis-Beard (dynamisch wachsend) */}
        <path 
          id="beard-path" 
          d={`M20 75 Q 50 75 80 75 L 80 ${75 + beardHeight * 0.4} Q 50 ${75 + beardHeight * 0.5} 20 ${75 + beardHeight * 0.4} Z`}
          fill="#3d2b1f"
          fillRule="evenodd"
          style={{ transition: 'all 0.2s ease' }}
        />

        {/* Haarstruktur: stroke-only Kopie des Pfades */}
        <path 
          id="beard-hair" 
          d={`M20 75 Q 50 75 80 75 L 80 ${75 + beardHeight * 0.4} Q 50 ${75 + beardHeight * 0.5} 20 ${75 + beardHeight * 0.4} Z`}
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
          d={`M20 75 Q 50 75 80 75 L 80 ${75 + beardHeight * 0.4} Q 50 ${75 + beardHeight * 0.5} 20 ${75 + beardHeight * 0.4} Z`}
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

