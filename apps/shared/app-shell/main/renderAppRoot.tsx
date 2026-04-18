import React from 'react';
import ReactDOM from 'react-dom/client';
import type { ReactNode } from 'react';

type RenderAppRootArgs = {
  app: ReactNode;
  wrapper?: (children: ReactNode) => ReactNode;
};

export function renderAppRoot({ app, wrapper }: RenderAppRootArgs) {
  const content = wrapper ? wrapper(app) : app;

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      {content}
    </React.StrictMode>,
  );
}
