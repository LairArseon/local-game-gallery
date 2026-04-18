import type { ComponentType } from 'react';

type TopbarPanelsProps<TTagPoolPanelProps, TFilterPanelProps> = {
  isTagPoolPanelOpen: boolean;
  isFilterPanelOpen: boolean;
  TagPoolPanelComponent: ComponentType<TTagPoolPanelProps>;
  FilterPanelComponent: ComponentType<TFilterPanelProps>;
  tagPoolPanelProps: TTagPoolPanelProps;
  filterPanelProps: TFilterPanelProps;
};

export function TopbarPanels<TTagPoolPanelProps, TFilterPanelProps>({
  isTagPoolPanelOpen,
  isFilterPanelOpen,
  TagPoolPanelComponent,
  FilterPanelComponent,
  tagPoolPanelProps,
  filterPanelProps,
}: TopbarPanelsProps<TTagPoolPanelProps, TFilterPanelProps>) {
  return (
    <>
      {isTagPoolPanelOpen ? <TagPoolPanelComponent {...tagPoolPanelProps} /> : null}
      {isFilterPanelOpen ? <FilterPanelComponent {...filterPanelProps} /> : null}
    </>
  );
}
