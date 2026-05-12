export function WarningIcon() {
  return (
    <svg data-ui="payment-alert-svg" width="20" height="20" viewBox="0 0 20 20" fill="none" className="flex-shrink-0 mt-0.5">
      <path
        d="M10 2L18.66 17H1.34L10 2Z"
        stroke="#f59e0b"
        strokeWidth="1.5"
        strokeLinejoin="round"
        data-ui="payment-alert-triangle"
      />
      <path
        d="M10 8V11.5"
        stroke="#f59e0b"
        strokeWidth="1.5"
        strokeLinecap="round"
        data-ui="payment-alert-exclamation"
      />
      <circle cx="10" cy="14" r="0.75" fill="#f59e0b" data-ui="payment-alert-dot" />
    </svg>
  );
}
