import { useCallback, useEffect, useRef, useState } from 'react';

type LongTaskSample = {
  startTimeMs: number;
  durationMs: number;
};

type ImageTimingSample = {
  name: string;
  durationMs: number;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
  startTimeMs: number;
};

type DiagnosticsContext = {
  viewMode: string;
  visibleCount: number;
  totalCount: number;
  renderedCount: number;
  isVirtualized: boolean;
  startRow: number;
  endRow: number;
  totalRows: number;
  isNarrowViewport: boolean;
  forceVirtualization: boolean;
};

function percentile(values: number[], p: number) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[index].toFixed(2));
}

function mean(values: number[]) {
  if (!values.length) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return Number((total / values.length).toFixed(2));
}

function downloadJson(fileBaseName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileBaseName}-${timestamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function useGalleryDiagnostics(enabled: boolean) {
  const [scrollY, setScrollY] = useState(0);
  const startedAtIsoRef = useRef(new Date().toISOString());
  const startedAtPerfRef = useRef(performance.now());
  const frameSamplesRef = useRef<number[]>([]);
  const longTaskSamplesRef = useRef<LongTaskSample[]>([]);
  const imageSamplesRef = useRef<ImageTimingSample[]>([]);
  const scrollEventCountRef = useRef(0);
  const lastFrameAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    startedAtIsoRef.current = new Date().toISOString();
    startedAtPerfRef.current = performance.now();
    frameSamplesRef.current = [];
    longTaskSamplesRef.current = [];
    imageSamplesRef.current = [];
    scrollEventCountRef.current = 0;
    lastFrameAtRef.current = null;

    let rafId: number | null = null;
    let scrollRafId: number | null = null;
    let mounted = true;

    const tick = (now: number) => {
      if (!mounted) {
        return;
      }

      const last = lastFrameAtRef.current;
      if (last !== null) {
        const delta = now - last;
        if (delta > 0 && delta < 1000) {
          const samples = frameSamplesRef.current;
          samples.push(delta);
          if (samples.length > 1800) {
            samples.shift();
          }
        }
      }

      lastFrameAtRef.current = now;
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    const onScroll = () => {
      scrollEventCountRef.current += 1;
      if (scrollRafId !== null) {
        return;
      }

      scrollRafId = window.requestAnimationFrame(() => {
        scrollRafId = null;
        setScrollY(Math.max(0, Math.round(window.scrollY)));
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });

    let longTaskObserver: PerformanceObserver | null = null;
    try {
      longTaskObserver = new PerformanceObserver((list) => {
        const samples = longTaskSamplesRef.current;
        for (const entry of list.getEntries()) {
          samples.push({
            startTimeMs: Number(entry.startTime.toFixed(2)),
            durationMs: Number(entry.duration.toFixed(2)),
          });
          if (samples.length > 400) {
            samples.shift();
          }
        }
      });
      longTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch {
      longTaskObserver = null;
    }

    let resourceObserver: PerformanceObserver | null = null;
    try {
      resourceObserver = new PerformanceObserver((list) => {
        const samples = imageSamplesRef.current;
        for (const entry of list.getEntries()) {
          const resource = entry as PerformanceResourceTiming;
          if (resource.initiatorType !== 'img') {
            continue;
          }

          samples.push({
            name: resource.name,
            durationMs: Number(resource.duration.toFixed(2)),
            transferSize: Number(resource.transferSize ?? 0),
            encodedBodySize: Number(resource.encodedBodySize ?? 0),
            decodedBodySize: Number(resource.decodedBodySize ?? 0),
            startTimeMs: Number(resource.startTime.toFixed(2)),
          });
          if (samples.length > 500) {
            samples.shift();
          }
        }
      });
      resourceObserver.observe({ entryTypes: ['resource'] });
    } catch {
      resourceObserver = null;
    }

    return () => {
      mounted = false;
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      if (scrollRafId !== null) {
        window.cancelAnimationFrame(scrollRafId);
      }
      window.removeEventListener('scroll', onScroll);
      longTaskObserver?.disconnect();
      resourceObserver?.disconnect();
    };
  }, [enabled]);

  const exportDiagnostics = useCallback((context: DiagnosticsContext) => {
    if (typeof window === 'undefined') {
      return false;
    }

    const frameSamples = frameSamplesRef.current;
    const longTaskSamples = longTaskSamplesRef.current;
    const imageSamples = imageSamplesRef.current;
    const elapsedMs = Math.max(1, performance.now() - startedAtPerfRef.current);
    const frameBudgetOver16msCount = frameSamples.filter((value) => value > 16.7).length;
    const frameBudgetOver33msCount = frameSamples.filter((value) => value > 33.4).length;
    const longTaskDurationTotalMs = longTaskSamples.reduce((sum, sample) => sum + sample.durationMs, 0);
    const imageDurationList = imageSamples.map((sample) => sample.durationMs).filter((value) => value > 0);

    const payload = {
      exportedAtIso: new Date().toISOString(),
      startedAtIso: startedAtIsoRef.current,
      durationMs: Number(elapsedMs.toFixed(2)),
      userAgent: navigator.userAgent,
      viewport: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      context,
      scroll: {
        y: scrollY,
        eventCount: scrollEventCountRef.current,
        eventsPerSecond: Number(((scrollEventCountRef.current * 1000) / elapsedMs).toFixed(2)),
      },
      frames: {
        sampleCount: frameSamples.length,
        meanMs: mean(frameSamples),
        p50Ms: percentile(frameSamples, 50),
        p95Ms: percentile(frameSamples, 95),
        p99Ms: percentile(frameSamples, 99),
        over16msCount: frameBudgetOver16msCount,
        over33msCount: frameBudgetOver33msCount,
      },
      longTasks: {
        sampleCount: longTaskSamples.length,
        totalDurationMs: Number(longTaskDurationTotalMs.toFixed(2)),
        maxDurationMs: Number(Math.max(0, ...longTaskSamples.map((sample) => sample.durationMs)).toFixed(2)),
      },
      images: {
        sampleCount: imageSamples.length,
        durationMeanMs: mean(imageDurationList),
        durationP95Ms: percentile(imageDurationList, 95),
        decodedBodySizeTotalBytes: imageSamples.reduce((sum, sample) => sum + sample.decodedBodySize, 0),
        transferSizeTotalBytes: imageSamples.reduce((sum, sample) => sum + sample.transferSize, 0),
      },
      samples: {
        longTasks: longTaskSamples,
        imageResources: imageSamples,
      },
    };

    downloadJson('lgg-gallery-diagnostics', payload);
    return true;
  }, [scrollY]);

  return {
    scrollY,
    exportDiagnostics,
  };
}
