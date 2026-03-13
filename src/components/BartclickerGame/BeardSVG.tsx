interface BeardProps {
  bartLength: number;
  clickCount?: number;
}

export function BeardSVG({ bartLength, clickCount = 0 }: BeardProps) {
  // Bartgröße basierend auf Rebirths (bartLength von 50 bis 100)
  // Normalisiere bartLength auf eine Prozentquote (50-100 → 0-1)
  const bartGrowth = (bartLength - 50) / 50; // 0 bis 1
  
  // Dynamische Bart-Höhe: VIEL KÜRZER
  // - Basis: 20px
  // - Rebirths: +100px max (statt 250)
  // - Klicks: +50px max (statt 200)
  // - Total max: 170px (statt 470px)
  const rebirthHeight = bartGrowth * 100;
  const clickHeight = Math.min(50, clickCount * 0.3);
  const beardHeight = 20 + rebirthHeight + clickHeight;
  
  // viewBox Height - simplified für bessere Performance
  const viewBoxHeight = Math.min(450, 350 + beardHeight);
  
  // SVG width/height mit korrektem Verhältnis zur viewBox
  const svgWidth = 180;
  const svgHeight = Math.round(svgWidth * (viewBoxHeight / 100));

  return (
    <svg 
      id="avatar-svg" 
      viewBox={`0 0 100 ${viewBoxHeight}`}
      xmlns="http://www.w3.org/2000/svg"
      className="beard-svg"
      style={{ 
        transition: 'all 0.2s ease'
      }}
    >
      {/* Kopf - mit Offset nach unten */}
      <rect x="20" y="32" width="60" height="50" rx="8" fill="#d4a373"/>

      {/* CAP (SNAPBACK) - mit Offset nach unten */}
      <g id="cap">
        {/* Schirm */}
        <rect x="15" y="34" width="70" height="7" rx="3" fill="#7C4DFF"/>
        {/* Amulett */}
        <path d="M20 34 L80 34 L80 24 Q 50 12 20 24 Z" fill="#7C4DFF"/>
        {/* Kleiner Knopf oben - höchster Punkt sitzt jetzt auf y=12 */}
        <circle cx="50" cy="12" r="3" fill="#5c38cc"/>
        {/* Rebirth Badge (hidden by default) */}
        <g id="rebirth-badge" style={{ display: 'none' }}>
          <circle cx="75" cy="24" r="8" fill="#FFD700" stroke="#FFA500" strokeWidth="1.5"/>
          <text x="75" y="28" fontSize="10" fontWeight="bold" fill="#000" textAnchor="middle" fontFamily="Arial">
            ♻
          </text>
        </g>
      </g>

      {/* Brille - mit Offset nach unten */}
      <g stroke="#111" strokeWidth="1.5" fill="none">
        <rect x="28" y="50" width="15" height="10" rx="2"/>
        <rect x="57" y="50" width="15" height="10" rx="2"/>
        <path d="M43 55 h14"/>
      </g>

      {/* Augen - mit Offset nach unten */}
      <circle cx="35" cy="55" r="1.5" fill="#000"/>
      <circle cx="65" cy="55" r="1.5" fill="#000"/>

      {/* DYNAMISCHER BART - WÄCHST NUR IN TIEFE */}
      <g 
        id="beard-group" 
        style={{ 
          transition: 'all 0.2s ease'
        }}
      >
        {/* Basis-Beard: 
            - Oben: M20 82 L80 82 (gerade Linie, gleich breit wie Gesicht)
            - Seiten: L80 dann L20 (gerade Linien nach unten)
            - Unten: gerundete Kurve (nur unten)
            - Überlagert Gesicht oben (y=82 ist über y=87)
        */}
        <path 
          id="beard-path" 
          d={`M20 82 L80 82 L80 ${82 + beardHeight} Q 50 ${82 + beardHeight + 5} 20 ${82 + beardHeight} Z`}
          fill="#3d2b1f"
          fillRule="evenodd"
          style={{ transition: 'all 0.2s ease' }}
        />

        {/* Haarstruktur: stroke-only Kopie des Pfades */}
        <path 
          id="beard-hair" 
          d={`M20 82 L80 82 L80 ${82 + beardHeight} Q 50 ${82 + beardHeight + 5} 20 ${82 + beardHeight} Z`}
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
          d={`M20 82 L80 82 L80 ${82 + beardHeight} Q 50 ${82 + beardHeight + 5} 20 ${82 + beardHeight} Z`}
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

