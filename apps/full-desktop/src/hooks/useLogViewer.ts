import { type Dispatch, type SetStateAction } from 'react';
import { useGalleryClient } from '../client/context';
import { useLogViewer as useSharedLogViewer } from '../../../shared/app-shell/hooks/useLogViewer';

type UseLogViewerArgs = {
  setStatus: Dispatch<SetStateAction<string>>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
};

export function useLogViewer(args: UseLogViewerArgs) {
  const galleryClient = useGalleryClient();
  return useSharedLogViewer({
    galleryClient,
    ...args,
  });
}
