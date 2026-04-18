/**
 * Mirror-fallback status banner for degraded data mode.
 */
type FloatingFallbackAlertProps = {
  title: string;
  body: string;
};

export function FloatingFallbackAlert({ title, body }: FloatingFallbackAlertProps) {
  return (
    <aside className="floating-fallback-alert" role="status" aria-live="polite">
      <p className="floating-fallback-alert__title">{title}</p>
      <p className="floating-fallback-alert__body">{body}</p>
    </aside>
  );
}
