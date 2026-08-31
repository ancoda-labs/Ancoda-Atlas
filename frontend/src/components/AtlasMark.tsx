/**
 * The Ancoda Atlas wordmark.
 *
 * The variant is chosen in CSS off `body.dark-theme`, not in JS, so a phone
 * fetches one 3.8KB WebP instead of both files and there is no swap after
 * hydration. Sizing lives with the placement, not here.
 */
export default function AtlasMark({ className }: { className?: string }) {
  return (
    <span
      className={className ? `atlas-mark ${className}` : 'atlas-mark'}
      role="img"
      aria-label="Ancoda Atlas"
    />
  );
}
