import { glucoseColor } from './glucoseColor';

describe('glucoseColor', () => {
  it('returns red for 3.8 (hypo)', () => {
    expect(glucoseColor(3.8)).toBe('#FF3B30');
  });

  it('returns green for 3.9 (lower boundary of in-range)', () => {
    expect(glucoseColor(3.9)).toBe('#30D158');
  });

  it('returns green for 10.0 (upper boundary of in-range)', () => {
    expect(glucoseColor(10.0)).toBe('#30D158');
  });

  it('returns orange for 10.1 (high)', () => {
    expect(glucoseColor(10.1)).toBe('#FF9500');
  });

  it('returns red for very low values', () => {
    expect(glucoseColor(2.0)).toBe('#FF3B30');
  });

  it('returns orange for very high values', () => {
    expect(glucoseColor(20.0)).toBe('#FF9500');
  });

  it('returns green for mid-range value', () => {
    expect(glucoseColor(7.0)).toBe('#30D158');
  });
});
