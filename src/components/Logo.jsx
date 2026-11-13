export default function Logo({ size = 40, withWordmark = false, light = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        role="img"
        aria-label="EASY RIDE"
        className="shrink-0"
      >
        <defs>
          <linearGradient id="erLane" x1="6" y1="10" x2="42" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="52%" stopColor="#22D3EE" />
            <stop offset="100%" stopColor="#34D399" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="13" fill="#0A1647" />
        {/* upper lane arching into a location pin */}
        <path
          d="M13 15.5h13.5c3 0 5.4 2.2 5.4 5.1"
          stroke="url(#erLane)"
          strokeWidth="2.8"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M31.9 20.6c-1.5 0-2.6 1.1-2.6 2.5 0 1.9 2.6 4.1 2.6 4.1s2.6-2.2 2.6-4.1c0-1.4-1.1-2.5-2.6-2.5z"
          fill="url(#erLane)"
        />
        {/* middle lane sweeping up into an arrow */}
        <path
          d="M13.5 33.5 22 24l4.6 4.4"
          stroke="url(#erLane)"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path d="M26.6 21.2v7.2h-7.2z" fill="url(#erLane)" opacity="0.9" />
        {/* lower lane curling into a bus silhouette */}
        <path
          d="M13.5 33.5h9.5c2.4 0 4.2 1.7 4.2 4"
          stroke="url(#erLane)"
          strokeWidth="2.8"
          strokeLinecap="round"
          fill="none"
        />
        <rect x="28.4" y="33.1" width="8.2" height="6.2" rx="1.8" fill="#34D399" />
        <circle cx="30.6" cy="40.1" r="1.05" fill="#0A1647" />
        <circle cx="34.4" cy="40.1" r="1.05" fill="#0A1647" />
      </svg>
      {withWordmark && (
        <div className="leading-none">
          <div className={`font-display text-[15px] font-extrabold tracking-[0.18em] ${light ? "text-white" : "text-brand-navy"}`}>
            EASY RIDE
          </div>
          <div className={`mt-1 text-[9.5px] font-medium uppercase tracking-[0.22em] ${light ? "text-white/60" : "text-muted-foreground"}`}>
            Rural college mobility
          </div>
        </div>
      )}
    </div>
  );
}