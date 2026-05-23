export function AnimatedCheckmark({ size = 80, color = '#22c55e' }: { size?: number; color?: string }) {
  return (
    <div data-ui="animated-checkmark-wrapper" className="animate-checkmark-appear">
      <svg data-ui="animated-checkmark" width={size} height={size} viewBox="0 0 80 80" fill="none">
        <circle
          data-ui="checkmark-circle"
          cx="40"
          cy="40"
          r="36"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          className="animate-checkmark-circle"
          style={{ strokeDasharray: 226, strokeDashoffset: 226 }}
        />
        <path
          data-ui="checkmark-tick"
          d="M24 42L34 52L56 30"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-checkmark-tick"
          style={{ strokeDasharray: 50, strokeDashoffset: 50 }}
        />
      </svg>
    </div>
  );
}
