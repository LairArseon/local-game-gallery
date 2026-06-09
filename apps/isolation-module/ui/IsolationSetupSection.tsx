import { useState, type FocusEvent, type MouseEvent } from 'react';
import type { BuiltInModuleRenderContext } from '../../shared/app-shell/types/moduleHostTypes';

type IsolationSetupSectionProps = {
  context: BuiltInModuleRenderContext;
};

export function IsolationSetupSection({ context }: IsolationSetupSectionProps) {
  const [hoverTooltip, setHoverTooltip] = useState<{
    text: string;
    left: number;
    top: number;
  } | null>(null);
  const moduleState = context.configState.state as {
    preferredProvider?: string;
    showDiagnostics?: boolean;
  };
  const preferredProvider = String(moduleState.preferredProvider ?? 'auto').trim() || 'auto';
  const supportsLaunchIsolation = context.serviceCapabilities?.supportsLaunchNetworkIsolation === true;
  const supportsLaunches = context.serviceCapabilities?.supportsLaunch === true;
  const isolationBackend = context.serviceCapabilities?.launchNetworkIsolationBackend ?? 'none';
  const nativeHelperPresent = context.serviceCapabilities?.launchNetworkIsolationNativeHelperPresent === true;
  const nativeHelperCompatible = context.serviceCapabilities?.launchNetworkIsolationNativeHelperCompatible === true;
  const nativeHelperVersion = String(context.serviceCapabilities?.launchNetworkIsolationNativeHelperVersion ?? '').trim();
  const helperBuildVersion = String(context.serviceCapabilities?.launchNetworkIsolationRequiredHelperVersion ?? '').trim();
  const helperCompatibilityMessage = String(context.serviceCapabilities?.launchNetworkIsolationHelperCompatibilityMessage ?? '').trim();
  const capabilityStatus = !context.serviceCapabilities
    ? 'unknown'
    : supportsLaunchIsolation
      ? 'available'
      : supportsLaunches
        ? 'unavailable on this host'
        : 'launching not available on this host';
  const backendStatus = isolationBackend === 'native'
    ? 'native helper'
    : isolationBackend === 'powershell'
      ? 'PowerShell fallback'
      : 'none';
  const helperStatus = !nativeHelperPresent
    ? 'not detected'
    : nativeHelperCompatible
      ? 'usable'
      : 'metadata issue';
  const helperVersionSummary = nativeHelperPresent && !nativeHelperCompatible
    ? helperCompatibilityMessage || 'Native helper metadata needs attention.'
    : '';
  const diagnosticsTooltip = [
    `Installer payload registered: ${context.configState.installed ? 'yes' : 'not yet'}.`,
    `Preferred provider: ${preferredProvider}.`,
    `Native helper detected: ${nativeHelperPresent ? 'yes' : 'no'}.`,
    `Helper build version: ${helperBuildVersion || 'unknown'}.`,
    `Detected helper version: ${nativeHelperVersion || 'unknown'}.`,
    helperCompatibilityMessage ? `Helper detail: ${helperCompatibilityMessage}` : '',
  ].filter(Boolean).join(' ');

  const openHoverTooltip = (text: string, event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const estimatedTooltipWidth = Math.min(360, window.innerWidth * 0.6);
    const viewportPadding = 12;
    const rightSideLeft = bounds.right + 10;
    const rightClampedLeft = window.innerWidth - estimatedTooltipWidth - viewportPadding;
    const hasRoomOnRight = rightSideLeft <= rightClampedLeft;
    const leftSideLeft = bounds.left - estimatedTooltipWidth - 10;
    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
    setHoverTooltip({
      text,
      left: hasRoomOnRight
        ? clamp(rightSideLeft, viewportPadding, Math.max(viewportPadding, rightClampedLeft))
        : clamp(leftSideLeft, viewportPadding, Math.max(viewportPadding, rightClampedLeft)),
      top: bounds.top + bounds.height / 2,
    });
  };

  const closeHoverTooltip = () => {
    setHoverTooltip(null);
  };

  return (
    <>
      <div className="field__hint isolation-setup">
        <p className="isolation-setup__intro">Optional host-side launch isolation for desktop environments.</p>
        <div className="isolation-setup__summary" role="list" aria-label="Isolation status summary">
          <div className="isolation-setup__item" role="listitem">
            <span className="isolation-setup__label">Module</span>
            <strong className="isolation-setup__value">{context.configState.enabled ? 'enabled' : 'disabled'}</strong>
          </div>
          <div className="isolation-setup__item" role="listitem">
            <span className="isolation-setup__label">Capability</span>
            <strong className="isolation-setup__value">{capabilityStatus}</strong>
          </div>
          <div className="isolation-setup__item" role="listitem">
            <span className="isolation-setup__label">Backend</span>
            <strong className="isolation-setup__value">{backendStatus}</strong>
          </div>
          <div className="isolation-setup__item" role="listitem">
            <span className="isolation-setup__label">Native helper</span>
            <strong className={`isolation-setup__value ${nativeHelperCompatible ? 'isolation-setup__value--ok' : 'isolation-setup__value--warning'}`}>{helperStatus}</strong>
          </div>
        </div>
        {helperVersionSummary ? <p className="isolation-setup__detail">{helperVersionSummary}</p> : null}
        <div className="isolation-setup__meta">
          <button
            aria-label="Show isolation diagnostics"
            className="app-icon-warning isolation-setup__help"
            onBlur={closeHoverTooltip}
            onFocus={(event) => {
              openHoverTooltip(diagnosticsTooltip, event);
            }}
            onMouseEnter={(event) => {
              openHoverTooltip(diagnosticsTooltip, event);
            }}
            onMouseLeave={closeHoverTooltip}
            type="button"
          >
            i
          </button>
          <span>Hover or focus for detailed diagnostics.</span>
        </div>
      </div>
      {hoverTooltip ? (
        <div
          className="app-icon-warning-layer"
          role="tooltip"
          style={{ left: `${hoverTooltip.left}px`, top: `${hoverTooltip.top}px` }}
        >
          {hoverTooltip.text}
        </div>
      ) : null}
    </>
  );
}