/**
 * Conditional host for topbar editing panels.
 *
 * This small composition component toggles the tag-pool and filter panels using
 * pre-built prop objects from App/hooks. It reduces JSX noise in App while
 * preserving strict prop contracts for each panel and keeping panel mount
 * behavior explicit.
 *
 * New to this project: this tiny host mounts topbar subpanels; use it to see panel boundaries, then open each panel component for detailed interactions.
 */
import type { ComponentProps } from 'react';
import { FilterPanel } from './FilterPanel';
import { TagPoolPanel } from './TagPoolPanel';

type TopbarPanelsProps = {
  isTagPoolPanelOpen: boolean;
  isFilterPanelOpen: boolean;
  tagPoolPanelProps: ComponentProps<typeof TagPoolPanel>;
  filterPanelProps: ComponentProps<typeof FilterPanel>;
};

export function TopbarPanels({
  isTagPoolPanelOpen,
  isFilterPanelOpen,
  tagPoolPanelProps,
  filterPanelProps,
}: TopbarPanelsProps) {
  return (
    <>
      {isTagPoolPanelOpen ? <TagPoolPanel {...tagPoolPanelProps} /> : null}
      {isFilterPanelOpen ? <FilterPanel {...filterPanelProps} /> : null}
    </>
  );
}






