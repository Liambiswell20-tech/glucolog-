import { parseCarbsGrams } from './parseCarbsGrams';

describe('parseCarbsGrams', () => {
  it('parses "45g" → 45', () => {
    expect(parseCarbsGrams('45g')).toBe(45);
  });

  it('parses "40-50g" (hyphen range) → 45 midpoint', () => {
    expect(parseCarbsGrams('40-50g')).toBe(45);
  });

  it('parses "40\u201350g" (en-dash range) → 45 midpoint', () => {
    expect(parseCarbsGrams('40\u201350g')).toBe(45);
  });

  it('returns null for null input', () => {
    expect(parseCarbsGrams(null)).toBeNull();
  });

  it('returns null for "no carbs"', () => {
    expect(parseCarbsGrams('no carbs')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseCarbsGrams('')).toBeNull();
  });

  it('handles value with surrounding text', () => {
    expect(parseCarbsGrams('approximately 30g of carbs')).toBe(30);
  });

  it('handles range with surrounding text', () => {
    expect(parseCarbsGrams('about 20-30g carbohydrates')).toBe(25);
  });
});
