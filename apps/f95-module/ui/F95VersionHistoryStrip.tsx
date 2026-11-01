import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getLatestF95Release } from '../core/f95VersionHistory';
import type { F95VersionHistory } from '../core/f95VersionHistory';

type ActiveRelease = { index: number; anchor: HTMLButtonElement; pinned: boolean };

export function F95VersionHistoryStrip({ history }: { history: F95VersionHistory }) {
  const tooltipId = useId();
  const [active, setActive] = useState<ActiveRelease | null>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = getLatestF95Release(history);
  const entry = active ? history.entries[active.index] : null;

  function cancelClose() {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      setActive((current) => current?.pinned || document.activeElement === current?.anchor ? current : null);
    }, 150);
  }

  useEffect(() => () => cancelClose(), []);

  useLayoutEffect(() => {
    if (!active || !tooltipRef.current) {
      return;
    }

    const anchor = active.anchor.getBoundingClientRect();
    const tooltip = tooltipRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(anchor.left, document.documentElement.clientWidth - tooltip.width - 8));
    const below = anchor.bottom + 6;
    const top = below + tooltip.height <= window.innerHeight - 8
      ? below : Math.max(8, anchor.top - tooltip.height - 6);
    setPosition({ left, top });
  }, [active, history]);

  useEffect(() => {
    if (!active) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !active?.anchor.contains(event.target)
        && !tooltipRef.current?.contains(event.target)) {
        setActive(null);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        cancelClose();
        setActive(null);
      }
    }

    function onViewportChange(event: Event) {
      if (event.target instanceof Node && tooltipRef.current?.contains(event.target)) {
        return;
      }

      setActive(null);
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [active]);

  return (
    <section className="f95-module-panel f95-version-history" aria-label={history.label}>
      <div className="f95-module-panel__heading">
        <strong>{history.label}</strong>
        {history.cadence ? <span className="f95-version-history__cadence">{history.cadence}</span> : null}
      </div>
      <ul className="f95-version-history__entries">
        {history.entries.map((release, index) => (
          <li key={`${release.version}:${release.releasedAt}:${index}`}>
            <button
              type="button"
              className={`f95-version-history__entry${release === latest ? ' f95-version-history__entry--latest' : ''}`}
              aria-label={`${release.version}${release === latest ? ', latest release' : ''}${release.dateLabel ? `, ${release.dateLabel}` : ''}`}
              aria-describedby={active?.index === index ? tooltipId : undefined}
              onMouseEnter={(event) => {
                cancelClose();
                const anchor = event.currentTarget;
                setActive((current) => current?.pinned ? current : { index, anchor, pinned: false });
              }}
              onMouseLeave={scheduleClose}
              onFocus={(event) => {
                cancelClose();
                setActive({ index, anchor: event.currentTarget, pinned: false });
              }}
              onBlur={(event) => {
                if (!tooltipRef.current?.contains(event.relatedTarget as Node | null)) {
                  scheduleClose();
                }
              }}
              onClick={(event) => {
                cancelClose();
                const anchor = event.currentTarget;
                setActive((current) => current?.index === index && current.pinned ? null : { index, anchor, pinned: true });
              }}
            >
              <span>{release.version}</span>
              {release.dateLabel ? <time dateTime={release.releasedAt || undefined}>{release.dateLabel}</time> : null}
            </button>
          </li>
        ))}
      </ul>
      {entry && (entry.changelog || entry.dateTitle || entry.datetime || entry.dateLabel) ? createPortal(
        <div
          className="f95-version-history__tooltip"
          role="tooltip"
          id={tooltipId}
          ref={tooltipRef}
          style={{ ...position, width: Math.min(420, document.documentElement.clientWidth - 16) }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <strong>{entry.version}</strong>
          <time dateTime={entry.releasedAt || undefined}>{entry.dateTitle || [entry.date || entry.dateLabel, entry.time].filter(Boolean).join(' ')}</time>
          {entry.datetime ? <span className="f95-version-history__timestamp">{entry.datetime}</span> : null}
          {entry.changelog ? <p>{entry.changelog}</p> : null}
        </div>, document.body,
      ) : null}
    </section>
  );
}