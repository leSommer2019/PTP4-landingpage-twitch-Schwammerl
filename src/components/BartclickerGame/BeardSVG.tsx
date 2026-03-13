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
  
  // ViewBox ist FESTE Größe - der Bart wächst nur im SVG selbst nach UNTEN
  // Kopf = 170 einheiten, Bart startet bei y=140
  // So bleibt der Kopf immer oben und der Bart wächst nur nach unten

  return (
      <svg
          id="avatar-svg"
          viewBox="0 0 200 400"
          xmlns="http://www.w3.org/2000/svg"
          className="beard-svg"
          style={{
            transition: 'all 0.2s ease',
            width: '100%',
            height: 'auto',
            maxHeight: '400px'
          }}
      >
        {/* KOPF - Startet jetzt bei y=40 (Platz für Cap-Knopf) */}
        <rect x="40" y="40" width="120" height="100" rx="16" fill="#d4a373"/>

        {/* CAP (SNAPBACK) */}
        <g id="cap">
          <rect x="30" y="44" width="140" height="14" rx="6" fill="#7C4DFF"/>
          <path d="M40 44 L160 44 L160 24 Q 100 0 40 24 Z" fill="#7C4DFF"/>
          <circle cx="100" cy="5" r="6" fill="#5c38cc"/>

          <g id="rebirth-badge" style={{ display: 'none' }}>
            <circle cx="150" cy="24" r="16" fill="#FFD700" stroke="#FFA500" strokeWidth="3"/>
            <text x="150" y="32" fontSize="20" fontWeight="bold" fill="#000" textAnchor="middle" fontFamily="Arial">♻</text>
          </g>
        </g>

        {/* Brille & Augen */}
        <g stroke="#111" strokeWidth="3" fill="none">
          <rect x="56" y="76" width="30" height="20" rx="4"/>
          <rect x="114" y="76" width="30" height="20" rx="4"/>
          <path d="M86 86 h28"/>
        </g>
        <circle cx="70" cy="86" r="3" fill="#000"/>
        <circle cx="130" cy="86" r="3" fill="#000"/>

        {/* DYNAMISCHER BART - Wächst nur nach UNTEN */}
        <g id="beard-group" style={{ transition: 'all 0.2s ease' }}>
          {/* Startet bei y=130 (überlappt Kopf um 10 Einheiten) und wächst von dort nach UNTEN */}
          <path
              id="beard-path"
              d={`M40 130 L160 130 L160 ${130 + beardHeight * 2} Q 100 ${130 + beardHeight * 2 + 10} 40 ${130 + beardHeight * 2} Z`}
              fill="#3d2b1f"
              style={{ transition: 'all 0.2s ease' }}
          />
          <path
              id="beard-hair"
              d={`M40 130 L160 130 L160 ${130 + beardHeight * 2} Q 100 ${130 + beardHeight * 2 + 10} 40 ${130 + beardHeight * 2} Z`}
              fill="none" stroke="#22160f" strokeWidth="1.8" strokeDasharray="4 8" opacity="0.85"
              style={{ transition: 'all 0.2s ease' }}
          />
        </g>
      </svg>
  );
}

