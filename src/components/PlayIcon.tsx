/** Filled triangle play mark for CTAs. */
export default function PlayIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2.5 1.2v9.6L10.8 6 2.5 1.2z" fill="currentColor" />
    </svg>
  );
}
