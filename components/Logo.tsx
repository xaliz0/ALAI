import { useId } from "react";

/** ALAI mark: a circuit-traced "A" inside a hex core, with an animated scan line. */
export default function Logo({ size = 32, animated = true }: { size?: number; animated?: boolean }) {
  const id = useId().replace(/:/g, "");
  const g = `lg-${id}`;
  const glow = `gl-${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={`logo ${animated ? "animated" : ""}`} aria-label="ALAI">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5ee7ff" />
          <stop offset=".55" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#ec4899" />
        </linearGradient>
        <filter id={glow} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* hex frame */}
      <path d="M32 3 57 17.5v29L32 61 7 46.5v-29Z" fill="rgba(94,231,255,0.05)" stroke={`url(#${g})`} strokeWidth="2" />
      <path d="M32 9.5 51.5 20.75v22.5L32 54.5 12.5 43.25v-22.5Z" fill="none" stroke="#5ee7ff" strokeOpacity=".25" strokeWidth="1" />
      {animated && (
        <path
          className="logo-scan"
          d="M32 3 57 17.5v29L32 61 7 46.5v-29Z"
          fill="none"
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinecap="round"
          pathLength="100"
          strokeDasharray="8 92"
        />
      )}

      <g filter={`url(#${glow})`} stroke={`url(#${g})`} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* the A */}
        <path d="M20 46 32 17l12 29" />
        <path d="M25 36h14" />
        {/* circuit traces */}
        <path d="M20 46h-6l-3-3" strokeWidth="1.6" />
        <path d="M44 46h6l3-3" strokeWidth="1.6" />
        <path d="M32 17v-6" strokeWidth="1.6" />
      </g>
      <g fill="#fff">
        <circle cx="32" cy="11" r="2" />
        <circle cx="11" cy="43" r="1.6" />
        <circle cx="53" cy="43" r="1.6" />
        <circle cx="32" cy="17" r="2.2" className={animated ? "logo-core" : undefined} />
        <circle cx="25" cy="36" r="1.5" />
        <circle cx="39" cy="36" r="1.5" />
      </g>
    </svg>
  );
}
