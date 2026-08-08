export function parsePrice(text: string): number {
  const normalized = text.replace(/,/g, "");
  const matches = [...normalized.matchAll(/(?:S\$|SGD|\$)\s*(\d+(?:\.\d{1,2})?)/gi)];
  const prices = matches
    .map((match) => Number(match[1]))
    .filter((price) => Number.isFinite(price) && price > 0);

  if (prices.length === 0) {
    throw new Error(`Could not identify a Singapore-dollar price in: ${text.slice(0, 120)}`);
  }

  return Math.min(...prices);
}

export function assertExpectedText(actual: string, expected: string, label: string): void {
  if (!actual.toLocaleLowerCase().includes(expected.toLocaleLowerCase())) {
    throw new Error(`${label} mismatch. Expected text containing "${expected}", received "${actual}".`);
  }
}

export function assertPriceLimit(actual: number, maximum: number): void {
  if (actual > maximum) {
    throw new Error(`Safety stop: unit price S$${actual.toFixed(2)} exceeds S$${maximum.toFixed(2)}.`);
  }
}
