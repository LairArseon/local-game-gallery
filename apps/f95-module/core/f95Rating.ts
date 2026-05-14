function parseF95NumericValue(value: string | number | null | undefined) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const normalizedValue = String(value ?? '').trim().replace(',', '.');
  const match = normalizedValue.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const parsedValue = Number.parseFloat(match[0]);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

export function normalizeF95Rating(value: string | number | null | undefined, bestRating?: string | number | null) {
  const parsedValue = parseF95NumericValue(value);
  if (parsedValue === null) {
    return null;
  }

  const parsedBestRating = parseF95NumericValue(bestRating);
  let normalizedRating = parsedValue;

  if (parsedBestRating !== null && parsedBestRating > 0) {
    normalizedRating = (parsedValue / parsedBestRating) * 5;
  } else if (parsedValue > 5 && parsedValue <= 10) {
    normalizedRating = (parsedValue / 10) * 5;
  } else if (parsedValue > 10 && parsedValue <= 100) {
    normalizedRating = (parsedValue / 100) * 5;
  }

  return Math.min(5, Math.max(0, normalizedRating));
}

export function parseStoredF95Rating(value: string) {
  return normalizeF95Rating(value);
}

export function roundF95RatingForDisplay(value: number | null) {
  if (value === null) {
    return null;
  }

  return Math.round(Math.max(0, Math.min(5, value)) * 2) / 2;
}

export function normalizeF95RatingString(value: string | number | null | undefined, bestRating?: string | number | null) {
  const normalizedRating = normalizeF95Rating(value, bestRating);
  if (normalizedRating === null) {
    return '';
  }

  return normalizedRating.toFixed(2).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0$/, '$1');
}

export function formatF95Rating(value: number) {
  return value.toFixed(1);
}

export function getF95RatingPercent(value: number | null) {
  if (value === null) {
    return 0;
  }

  return Math.min(100, Math.max(0, (value / 5) * 100));
}