const NIGHTSCOUT_URL = 'https://p01--nightscout--7x4mdclxhl6z.code.run/api/v1/entries.json';
const TOKEN = 'librelinku-b02e1144f33f2822';

export type TrendDirection =
  | 'DoubleUp'
  | 'SingleUp'
  | 'FortyFiveUp'
  | 'Flat'
  | 'FortyFiveDown'
  | 'SingleDown'
  | 'DoubleDown'
  | 'NOT COMPUTABLE'
  | 'RATE OUT OF RANGE';

export interface GlucoseEntry {
  sgv: number;        // mg/dL — divide by 18 for mmol/L
  date: number;       // epoch ms
  dateString: string;
  direction: TrendDirection;
  type: string;
}

export interface GlucoseReading {
  mmol: number;
  direction: TrendDirection;
  date: Date;
  isStale: boolean;
}

export interface CurvePoint {
  mmol: number;
  date: number; // epoch ms
}

const TREND_ARROWS: Record<TrendDirection, string> = {
  DoubleUp: '↑↑',
  SingleUp: '↑',
  FortyFiveUp: '↗',
  Flat: '→',
  FortyFiveDown: '↘',
  SingleDown: '↓',
  DoubleDown: '↓↓',
  'NOT COMPUTABLE': '?',
  'RATE OUT OF RANGE': '?',
};

export function trendArrow(direction: TrendDirection): string {
  return TREND_ARROWS[direction] ?? '?';
}

export async function fetchLatestGlucose(): Promise<GlucoseReading> {
  const url = `${NIGHTSCOUT_URL}?count=1&token=${TOKEN}`;
  const response = await fetch(url);

  if (!response.ok) throw new Error(`Nightscout error: ${response.status}`);

  const entries: GlucoseEntry[] = await response.json();
  if (!entries || entries.length === 0) throw new Error('No glucose readings available');

  const entry = entries[0];
  return {
    mmol: Math.round((entry.sgv / 18) * 10) / 10,
    direction: entry.direction,
    date: new Date(entry.date),
    isStale: Date.now() - entry.date > 10 * 60 * 1000,
  };
}

// Fetch all entries since a given timestamp, sorted oldest-first.
// Used for the rolling glucose store — on first load pass 30d ago, on subsequent loads pass lastFetchedAt.
// count=9000 is a ceiling that only matters on first load (30d = ~8,640 readings).
export async function fetchGlucosesSince(fromMs: number): Promise<GlucoseEntry[]> {
  const url = `${NIGHTSCOUT_URL}?count=9000&token=${TOKEN}&find[date][$gte]=${fromMs}`;
  const response = await fetch(url);
  if (!response.ok) return [];
  const entries: GlucoseEntry[] = await response.json();
  if (!entries || entries.length === 0) return [];
  return entries.sort((a, b) => a.date - b.date);
}

// Fetch all readings between two epoch-ms timestamps (up to 100 readings = ~8hrs)
export async function fetchGlucoseRange(fromMs: number, toMs: number): Promise<CurvePoint[]> {
  const url =
    `${NIGHTSCOUT_URL}?count=100&token=${TOKEN}` +
    `&find[date][$gte]=${fromMs}&find[date][$lte]=${toMs}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Nightscout error: ${response.status}`);

  const entries: GlucoseEntry[] = await response.json();
  if (!entries || entries.length === 0) return [];

  // Sort oldest-first so curves read left-to-right
  return entries
    .sort((a, b) => a.date - b.date)
    .map(e => ({
      mmol: Math.round((e.sgv / 18) * 10) / 10,
      date: e.date,
    }));
}
