"use client";

/**
 * Neural Pulse Robot Head loading animation.
 * Robot head with glowing eyes, neural pathways firing in the brain,
 * antenna, ear panels, and segmented mouth — all in brand orange.
 */
export default function LoadingAI({ message = "Loading" }: { message?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 select-none">
      <svg width="120" height="140" viewBox="0 0 160 180" fill="none" xmlns="http://www.w3.org/2000/svg">

        {/* Robot head - rounded rectangle */}
        <rect x="30" y="20" width="100" height="110" rx="20" ry="20" fill="var(--bg)" stroke="#ea580c" strokeWidth="2" opacity="0.7"/>

        {/* Forehead plate line */}
        <line x1="45" y1="35" x2="115" y2="35" stroke="#ea580c" strokeWidth="0.5" opacity="0.3"/>

        {/* Antenna */}
        <line x1="80" y1="20" x2="80" y2="5" stroke="#ea580c" strokeWidth="1.5" opacity="0.5"/>
        <circle cx="80" cy="5" r="3" fill="#ea580c" opacity="0.6">
          <animate attributeName="opacity" values="0.3;1;0.3" dur="1.5s" repeatCount="indefinite"/>
        </circle>

        {/* Ear panels */}
        <rect x="18" y="50" width="12" height="30" rx="3" fill="none" stroke="#ea580c" strokeWidth="1" opacity="0.3"/>
        <rect x="130" y="50" width="12" height="30" rx="3" fill="none" stroke="#ea580c" strokeWidth="1" opacity="0.3"/>
        {/* Ear indicators */}
        <rect x="20" y="55" width="8" height="6" rx="1" fill="#ea580c" opacity="0.15">
          <animate attributeName="opacity" values="0.1;0.3;0.1" dur="2s" repeatCount="indefinite"/>
        </rect>
        <rect x="20" y="64" width="8" height="6" rx="1" fill="#ea580c" opacity="0.15">
          <animate attributeName="opacity" values="0.1;0.3;0.1" dur="2s" begin="0.5s" repeatCount="indefinite"/>
        </rect>
        <rect x="132" y="55" width="8" height="6" rx="1" fill="#ea580c" opacity="0.15">
          <animate attributeName="opacity" values="0.1;0.3;0.1" dur="2s" begin="0.3s" repeatCount="indefinite"/>
        </rect>
        <rect x="132" y="64" width="8" height="6" rx="1" fill="#ea580c" opacity="0.15">
          <animate attributeName="opacity" values="0.1;0.3;0.1" dur="2s" begin="0.8s" repeatCount="indefinite"/>
        </rect>

        {/* Eyes */}
        <circle cx="58" cy="65" r="10" fill="none" stroke="#ea580c" strokeWidth="1.5" opacity="0.5"/>
        <circle cx="58" cy="65" r="5" fill="#ea580c" opacity="0.15">
          <animate attributeName="r" values="4;6;4" dur="2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.1;0.25;0.1" dur="2s" repeatCount="indefinite"/>
        </circle>
        <circle cx="58" cy="65" r="2.5" fill="#ea580c" opacity="0.7">
          <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite"/>
        </circle>

        <circle cx="102" cy="65" r="10" fill="none" stroke="#ea580c" strokeWidth="1.5" opacity="0.5"/>
        <circle cx="102" cy="65" r="5" fill="#ea580c" opacity="0.15">
          <animate attributeName="r" values="4;6;4" dur="2s" begin="0.2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.1;0.25;0.1" dur="2s" begin="0.2s" repeatCount="indefinite"/>
        </circle>
        <circle cx="102" cy="65" r="2.5" fill="#ea580c" opacity="0.7">
          <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" begin="0.2s" repeatCount="indefinite"/>
        </circle>

        {/* Mouth segments */}
        <line x1="60" y1="100" x2="70" y2="100" stroke="#ea580c" strokeWidth="1.5" opacity="0.4" strokeLinecap="round"/>
        <line x1="73" y1="100" x2="80" y2="100" stroke="#ea580c" strokeWidth="1.5" opacity="0.4" strokeLinecap="round">
          <animate attributeName="opacity" values="0.2;0.6;0.2" dur="1.5s" repeatCount="indefinite"/>
        </line>
        <line x1="83" y1="100" x2="90" y2="100" stroke="#ea580c" strokeWidth="1.5" opacity="0.4" strokeLinecap="round">
          <animate attributeName="opacity" values="0.2;0.6;0.2" dur="1.5s" begin="0.3s" repeatCount="indefinite"/>
        </line>
        <line x1="93" y1="100" x2="100" y2="100" stroke="#ea580c" strokeWidth="1.5" opacity="0.4" strokeLinecap="round">
          <animate attributeName="opacity" values="0.2;0.6;0.2" dur="1.5s" begin="0.6s" repeatCount="indefinite"/>
        </line>

        {/* Chin line */}
        <line x1="50" y1="115" x2="110" y2="115" stroke="#ea580c" strokeWidth="0.5" opacity="0.2"/>

        {/* Neck */}
        <rect x="65" y="130" width="30" height="15" rx="3" fill="none" stroke="#ea580c" strokeWidth="1" opacity="0.3"/>
        <line x1="72" y1="132" x2="72" y2="143" stroke="#ea580c" strokeWidth="0.5" opacity="0.2"/>
        <line x1="80" y1="132" x2="80" y2="143" stroke="#ea580c" strokeWidth="0.5" opacity="0.2"/>
        <line x1="88" y1="132" x2="88" y2="143" stroke="#ea580c" strokeWidth="0.5" opacity="0.2"/>

        {/* ── NEURAL PULSE BRAIN ── */}
        <g transform="translate(80, 48)">
          {/* Neural pathways */}
          {[[-16, 0], [-8, 14], [8, 14], [16, 0], [8, -14], [-8, -14]].map(([x, y], i) => (
            <g key={i}>
              <line x1="0" y1="0" x2={x} y2={y} stroke="#ea580c" strokeWidth="0.6" opacity="0.25"/>
              <circle r="2" fill={i % 2 === 0 ? "#ea580c" : "#f97316"} opacity="0.9">
                <animateMotion dur="1.2s" begin={`${i * 0.2}s`} repeatCount="indefinite" path={`M0,0 L${x},${y}`}/>
                <animate attributeName="opacity" values="0;1;0" dur="1.2s" begin={`${i * 0.2}s`} repeatCount="indefinite"/>
              </circle>
              <circle cx={x} cy={y} r="2" fill="#ea580c" opacity="0.4">
                <animate attributeName="opacity" values="0.2;0.8;0.2" dur="1.2s" begin={`${i * 0.2}s`} repeatCount="indefinite"/>
              </circle>
            </g>
          ))}
          {/* Centre node */}
          <circle r="4" fill="var(--bg)" stroke="#ea580c" strokeWidth="1"/>
          <circle r="2" fill="#ea580c" opacity="0.5">
            <animate attributeName="r" values="1.5;3;1.5" dur="1.5s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.3;0.7;0.3" dur="1.5s" repeatCount="indefinite"/>
          </circle>
        </g>

        {/* Subtle head glow */}
        <rect x="30" y="20" width="100" height="110" rx="20" ry="20" fill="none" stroke="#ea580c" strokeWidth="1" opacity="0.08">
          <animate attributeName="opacity" values="0.05;0.15;0.05" dur="3s" repeatCount="indefinite"/>
        </rect>

      </svg>

      {/* Text with animated dots */}
      <div className="flex items-center gap-1">
        <span className="text-sm font-medium tracking-wide" style={{ color: "var(--text-muted)" }}>{message}</span>
        <span className="flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="inline-block w-1 h-1 rounded-full" style={{
              background: "var(--accent)",
              animation: `aidot 1.4s ${i * 0.2}s ease-in-out infinite`,
            }} />
          ))}
        </span>
      </div>

      <style>{`
        @keyframes aidot {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}
