import { useEffect, useRef, useState } from 'react';
import { getBuiltInModuleRegistry, loadBuiltInModuleRegistry } from '../core/builtInModules';

type UseBuiltInModuleRegistryLogFn = (
  message: string,
  level?: 'info' | 'warn' | 'error',
  source?: string,
) => Promise<void>;

export function useBuiltInModuleRegistry(logAppEvent?: UseBuiltInModuleRegistryLogFn) {
  const [registry, setRegistry] = useState(() => getBuiltInModuleRegistry());
  const latestLogAppEventRef = useRef(logAppEvent);

  latestLogAppEventRef.current = logAppEvent;

  useEffect(() => {
    let isDisposed = false;

    void loadBuiltInModuleRegistry({
      onError: async (message, source) => {
        await latestLogAppEventRef.current?.(message, 'warn', source);
      },
    }).then((nextRegistry) => {
      if (!isDisposed) {
        setRegistry(nextRegistry);
      }
    });

    return () => {
      isDisposed = true;
    };
  }, []);

  return registry;
}