"use client";

/**
 * Animated AI-themed loading spinner in Innov8 brand colours.
 * Features a pulsing neural-network / brain-circuit motif with
 * orbiting nodes and a glowing core.
 */
export default function LoadingAI({ message = "Loading" }: { message?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 select-none">
      {/* SVG animation */}
      <div className="relative" style={{ width: 96, height: 96 }}>
        <svg viewBox="0 0 96 96" width={96} height={96} fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Outer ring - slow spin */}
          <circle cx="48" cy="48" r="44" stroke="#2a2a2a" strokeWidth="1.5" />
          <circle cx="48" cy="48" r="44" stroke="url(#ring)" strokeWidth="2" strokeLinecap="round"
            strokeDasharray="70 210">
            <animateTransform attributeName="transform" type="rotate" from="0 48 48" to="360 48 48" dur="3s" repeatCount="indefinite" />
          </circle>

          {/* Middle ring - counter-spin */}
          <circle cx="48" cy="48" r="32" stroke="#1e1e1e" strokeWidth="1" />
          <circle cx="48" cy="48" r="32" stroke="url(#ring2)" strokeWidth="1.5" strokeLinecap="round"
            strokeDasharray="40 160">
            <animateTransform attributeName="transform" type="rotate" from="360 48 48" to="0 48 48" dur="2s" repeatCount="indefinite" />
          </circle>

          {/* Neural connection lines (6 spokes) */}
          {[0, 60, 120, 180, 240, 300].map((angle) => (
            <line key={angle} x1="48" y1="48"
              x2={48 + 38 * Math.cos((angle * Math.PI) / 180)}
              y2={48 + 38 * Math.sin((angle * Math.PI) / 180)}
              stroke="#ea580c" strokeWidth="0.5" opacity="0.25">
              <animate attributeName="opacity" values="0.1;0.4;0.1" dur="2s" begin={`${angle / 360}s`} repeatCount="indefinite" />
            </line>
          ))}

          {/* Orbiting nodes (3 dots on the outer ring) */}
          {[0, 1, 2].map((i) => (
            <circle key={i} r="3" fill="#ea580c" opacity="0.9">
              <animateMotion dur="3s" begin={`${i}s`} repeatCount="indefinite"
                path="M48,4 A44,44 0 1,1 47.99,4" />
              <animate attributeName="r" values="2;3.5;2" dur="1.5s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
            </circle>
          ))}

          {/* Inner orbiting nodes (2 dots on middle ring) */}
          {[0, 1].map((i) => (
            <circle key={`inner-${i}`} r="2" fill="#f97316" opacity="0.7">
              <animateMotion dur="2s" begin={`${i * 1}s`} repeatCount="indefinite"
                path="M48,16 A32,32 0 1,0 48.01,16" />
              <animate attributeName="r" values="1.5;2.5;1.5" dur="1s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
            </circle>
          ))}

          {/* Core AI "brain" icon */}
          <g transform="translate(48,48)">
            {/* Pulsing glow */}
            <circle r="14" fill="#ea580c" opacity="0.06">
              <animate attributeName="r" values="12;16;12" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.06;0.12;0.06" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle r="10" fill="#161616" stroke="#ea580c" strokeWidth="1.5" opacity="0.9" />

            {/* AI circuit pattern inside core */}
            {/* Horizontal line */}
            <line x1="-4" y1="0" x2="4" y2="0" stroke="#ea580c" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
            {/* Vertical line */}
            <line x1="0" y1="-4" x2="0" y2="4" stroke="#ea580c" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
            {/* Corner nodes */}
            <circle cx="-4" cy="-4" r="1.2" fill="#ea580c" opacity="0.7">
              <animate attributeName="opacity" values="0.4;1;0.4" dur="1.5s" begin="0s" repeatCount="indefinite" />
            </circle>
            <circle cx="4" cy="-4" r="1.2" fill="#ea580c" opacity="0.7">
              <animate attributeName="opacity" values="0.4;1;0.4" dur="1.5s" begin="0.4s" repeatCount="indefinite" />
            </circle>
            <circle cx="4" cy="4" r="1.2" fill="#ea580c" opacity="0.7">
              <animate attributeName="opacity" values="0.4;1;0.4" dur="1.5s" begin="0.8s" repeatCount="indefinite" />
            </circle>
            <circle cx="-4" cy="4" r="1.2" fill="#ea580c" opacity="0.7">
              <animate attributeName="opacity" values="0.4;1;0.4" dur="1.5s" begin="1.2s" repeatCount="indefinite" />
            </circle>
            {/* Diagonal connectors */}
            <line x1="-4" y1="-4" x2="4" y2="4" stroke="#f97316" strokeWidth="0.5" opacity="0.4" />
            <line x1="4" y1="-4" x2="-4" y2="4" stroke="#f97316" strokeWidth="0.5" opacity="0.4" />
          </g>

          {/* Gradient definitions */}
          <defs>
            <linearGradient id="ring" x1="0" y1="0" x2="96" y2="96">
              <stop offset="0%" stopColor="#ea580c" />
              <stop offset="50%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#ea580c" stopOpacity="0.3" />
            </linearGradient>
            <linearGradient id="ring2" x1="96" y1="0" x2="0" y2="96">
              <stop offset="0%" stopColor="#f97316" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#ea580c" stopOpacity="0.2" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Text with animated dots */}
      <div className="flex items-center gap-1">
        <span className="text-sm font-medium tracking-wide" style={{ color: "#888" }}>{message}</span>
        <span className="flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="inline-block w-1 h-1 rounded-full" style={{
              background: "#ea580c",
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
