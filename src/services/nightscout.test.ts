import { fetchLatestGlucose, fetchGlucoseRange } from './nightscout';

// Mock global fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

afterEach(() => mockFetch.mockReset());

describe('fetchLatestGlucose', () => {
  it('converts sgv from mg/dL to mmol/L', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ sgv: 126, date: Date.now(), dateString: '', direction: 'Flat', type: 'sgv' }],
    });
    const reading = await fetchLatestGlucose();
    expect(reading.mmol).toBe(7.0); // 126/18 = 7.0
    expect(reading.direction).toBe('Flat');
  });

  it('marks reading as stale when older than 10 minutes', async () => {
    const tenMinsAgo = Date.now() - 11 * 60 * 1000;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ sgv: 90, date: tenMinsAgo, dateString: '', direction: 'Flat', type: 'sgv' }],
    });
    const reading = await fetchLatestGlucose();
    expect(reading.isStale).toBe(true);
  });

  it('marks reading as fresh when recent', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ sgv: 90, date: Date.now(), dateString: '', direction: 'Flat', type: 'sgv' }],
    });
    const reading = await fetchLatestGlucose();
    expect(reading.isStale).toBe(false);
  });

  it('throws on empty entries', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await expect(fetchLatestGlucose()).rejects.toThrow('No glucose readings available');
  });

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(fetchLatestGlucose()).rejects.toThrow('Nightscout error: 500');
  });
});

describe('fetchGlucoseRange', () => {
  it('deduplicates entries by timestamp', async () => {
    const ts = Date.now();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { sgv: 108, date: ts, dateString: '', direction: 'Flat', type: 'sgv' },
        { sgv: 108, date: ts, dateString: '', direction: 'Flat', type: 'sgv' },
        { sgv: 126, date: ts + 300000, dateString: '', direction: 'Flat', type: 'sgv' },
      ],
    });
    const points = await fetchGlucoseRange(ts - 1000, ts + 400000);
    expect(points).toHaveLength(2);
    expect(points[0].mmol).toBe(6.0); // 108/18
    expect(points[1].mmol).toBe(7.0); // 126/18
  });

  it('returns sorted oldest-first', async () => {
    const ts = Date.now();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { sgv: 126, date: ts + 300000, dateString: '', direction: 'Flat', type: 'sgv' },
        { sgv: 108, date: ts, dateString: '', direction: 'Flat', type: 'sgv' },
      ],
    });
    const points = await fetchGlucoseRange(ts - 1000, ts + 400000);
    expect(points[0].date).toBeLessThan(points[1].date);
  });
});
