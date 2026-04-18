import { createContext, useContext, type ReactNode } from 'react';
import type { GalleryClient } from './contracts';

type GalleryClientProviderProps = {
  client: GalleryClient;
  children: ReactNode;
};

const GalleryClientContext = createContext<GalleryClient | null>(null);

export function GalleryClientProvider({ client, children }: GalleryClientProviderProps) {
  return (
    <GalleryClientContext.Provider value={client}>
      {children}
    </GalleryClientContext.Provider>
  );
}

export function useGalleryClient() {
  const client = useContext(GalleryClientContext);
  if (!client) {
    throw new Error('GalleryClientProvider is missing in React tree.');
  }

  return client;
}
