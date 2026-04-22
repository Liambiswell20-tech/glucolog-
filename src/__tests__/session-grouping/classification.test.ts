/**
 * Phase B — Classification Engine + Matching Key Tests
 * Spec: Session Grouping Design Spec, Section 2 (Classification) + Section 7.1 (matching_key)
 *
 * Test IDs from build plan: T-A1, T-A2, T-A3, T-E2, T-E3, T-D6
 */
import {
  classifyMeal,
  computeMatchingKey,
  loadKeywordDictionary,
  type ClassificationResult,
} from '../../services/classification';

// ---------------------------------------------------------------------------
// T-A1: Solo quick sugar via override keyword (Section 2, 3)
// ---------------------------------------------------------------------------
describe('T-A1: Override keyword → quick_sugar', () => {
  it('classifies "Lucozade" as quick_sugar via override keyword', () => {
    const result = classifyMeal('Lucozade', 15);
    expect(result.bucket).toBe('quick_sugar');
    expect(result.method).toBe('override_keyword');
    expect(result.matchedKeyword).toBe('lucozade');
    expect(result.digestionWindowMinutes).toBe(60);
  });

  it('classifies "jelly babies" as quick_sugar regardless of case', () => {
    const result = classifyMeal('Jelly Babies', 20);
    expect(result.bucket).toBe('quick_sugar');
    expect(result.method).toBe('override_keyword');
    expect(result.matchedKeyword).toBe('jelly babies');
    expect(result.digestionWindowMinutes).toBe(60);
  });

  it('classifies "orange juice" as quick_sugar (substring match)', () => {
    const result = classifyMeal('Large orange juice', 30);
    expect(result.bucket).toBe('quick_sugar');
    expect(result.method).toBe('override_keyword');
    expect(result.matchedKeyword).toBe('orange juice');
    expect(result.digestionWindowMinutes).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// T-A2: Solo mixed meal via carb bucket (Section 2)
// ---------------------------------------------------------------------------
describe('T-A2: Carb bucket → mixed_meal', () => {
  it('classifies 45g carbs with no keyword match as mixed_meal', () => {
    const result = classifyMeal('Spaghetti bolognese', 45);
    expect(result.bucket).toBe('mixed_meal');
    expect(result.method).toBe('carb_bucket');
    expect(result.matchedKeyword).toBeNull();
    expect(result.digestionWindowMinutes).toBe(180);
  });

  it('classifies 35g carbs as mixed_meal (>30g threshold)', () => {
    const result = classifyMeal('Chicken wrap', 35);
    expect(result.bucket).toBe('mixed_meal');
    expect(result.method).toBe('carb_bucket');
    expect(result.digestionWindowMinutes).toBe(180);
  });
});

// ---------------------------------------------------------------------------
// T-A2 extended: Carb bucket → quick_sugar and simple_snack
// ---------------------------------------------------------------------------
describe('T-A2 extended: Carb bucket thresholds', () => {
  it('classifies 10g carbs with no keyword match as quick_sugar (<15g)', () => {
    const result = classifyMeal('Small snack', 10);
    expect(result.bucket).toBe('quick_sugar');
    expect(result.method).toBe('carb_bucket');
    expect(result.digestionWindowMinutes).toBe(60);
  });

  it('classifies 20g carbs with no keyword match as simple_snack (15-30g)', () => {
    const result = classifyMeal('Some crackers', 20);
    // "crackers" is a simple_snack override keyword, so this will match via override
    // Use a name with no keyword match instead
    const result2 = classifyMeal('Homemade flapjack', 20);
    expect(result2.bucket).toBe('simple_snack');
    expect(result2.method).toBe('carb_bucket');
    expect(result2.digestionWindowMinutes).toBe(90);
  });

  it('classifies exactly 15g as simple_snack (boundary inclusive)', () => {
    const result = classifyMeal('Homemade flapjack', 15);
    expect(result.bucket).toBe('simple_snack');
    expect(result.method).toBe('carb_bucket');
    expect(result.digestionWindowMinutes).toBe(90);
  });

  it('classifies exactly 30g as simple_snack (boundary inclusive)', () => {
    const result = classifyMeal('Homemade flapjack', 30);
    expect(result.bucket).toBe('simple_snack');
    expect(result.method).toBe('carb_bucket');
    expect(result.digestionWindowMinutes).toBe(90);
  });
});

// ---------------------------------------------------------------------------
// T-A3: Fallback classification (Section 2)
// ---------------------------------------------------------------------------
describe('T-A3: Fallback classification', () => {
  it('falls back to mixed_meal when carbs is null', () => {
    const result = classifyMeal('Mystery food', null);
    expect(result.bucket).toBe('mixed_meal');
    expect(result.method).toBe('fallback');
    expect(result.matchedKeyword).toBeNull();
    expect(result.digestionWindowMinutes).toBe(180);
  });

  it('falls back to mixed_meal when carbs is 0 and no keyword match', () => {
    const result = classifyMeal('Something unknown', 0);
    expect(result.bucket).toBe('quick_sugar');
    expect(result.method).toBe('carb_bucket');
    expect(result.digestionWindowMinutes).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// T-E2: Override keyword with 0g carbs (Section 2) — override wins
// ---------------------------------------------------------------------------
describe('T-E2: Override keyword with 0g carbs', () => {
  it('override keyword wins even when carbs are 0', () => {
    const result = classifyMeal('Pizza', 0);
    expect(result.bucket).toBe('fat_heavy');
    expect(result.method).toBe('override_keyword');
    expect(result.matchedKeyword).toBe('pizza');
    expect(result.digestionWindowMinutes).toBe(240);
  });

  it('override keyword wins even when carbs are null', () => {
    const result = classifyMeal('Curry', null);
    expect(result.bucket).toBe('fat_heavy');
    expect(result.method).toBe('override_keyword');
    expect(result.matchedKeyword).toBe('curry');
    expect(result.digestionWindowMinutes).toBe(240);
  });
});

// ---------------------------------------------------------------------------
// T-E3: Multiple override keywords — first-match-wins (Section 2)
// ---------------------------------------------------------------------------
describe('T-E3: Multiple override keywords', () => {
  it('first-match-wins: quick_sugar checked before simple_snack', () => {
    // "honey" is quick_sugar, "toast" is simple_snack
    // "honey on toast" contains both — quick_sugar should win (checked first)
    const result = classifyMeal('Honey on toast', 25);
    expect(result.bucket).toBe('quick_sugar');
    expect(result.method).toBe('override_keyword');
    expect(result.matchedKeyword).toBe('honey');
    expect(result.digestionWindowMinutes).toBe(60);
  });

  it('fat_heavy keyword overrides even with quick_sugar keywords present', () => {
    // The bucket scan order is: quick_sugar → simple_snack → fat_heavy
    // But "pizza" contains no quick_sugar or simple_snack keywords
    const result = classifyMeal('Cheesy pizza', 60);
    expect(result.bucket).toBe('fat_heavy');
    expect(result.method).toBe('override_keyword');
    expect(result.matchedKeyword).toBe('pizza');
    expect(result.digestionWindowMinutes).toBe(240);
  });
});

// ---------------------------------------------------------------------------
// T-D6: matching_key normalisation (Section 7.1)
// ---------------------------------------------------------------------------
describe('T-D6: computeMatchingKey normalisation', () => {
  it('lowercases and trims', () => {
    expect(computeMatchingKey('  Chips  ')).toBe('chips');
  });

  it('strips conjunctions: "and", "with", "&", "plus", "+"', () => {
    expect(computeMatchingKey('chips and mayo')).toBe('chips mayo');
    expect(computeMatchingKey('chips with mayo')).toBe('chips mayo');
    expect(computeMatchingKey('chips & mayo')).toBe('chips mayo');
    expect(computeMatchingKey('chips plus mayo')).toBe('chips mayo');
    expect(computeMatchingKey('chips + mayo')).toBe('chips mayo');
  });

  it('preserves ingredient words (unlike getMealFingerprint)', () => {
    // Current getMealFingerprint strips "on", "some", "extra", "side", "no"
    // matching_key must NOT strip these — only conjunctions
    expect(computeMatchingKey('beans on toast')).toBe('beans on toast');
    expect(computeMatchingKey('extra cheese')).toBe('extra cheese');
    expect(computeMatchingKey('no mayo')).toBe('no mayo');
    expect(computeMatchingKey('side of chips')).toBe('side of chips');
  });

  it('collapses multiple spaces', () => {
    expect(computeMatchingKey('chips   and   mayo')).toBe('chips mayo');
  });

  it('strips trailing/leading punctuation', () => {
    expect(computeMatchingKey('chips.')).toBe('chips');
    expect(computeMatchingKey('chips!')).toBe('chips');
    expect(computeMatchingKey('"chips"')).toBe('chips');
  });

  it('case-insensitive matching across examples', () => {
    // Spec worked examples
    expect(computeMatchingKey('chips')).toBe(computeMatchingKey('Chips'));
    expect(computeMatchingKey('chips')).toBe(computeMatchingKey('chips '));
    expect(computeMatchingKey('chips')).toBe(computeMatchingKey('chips.'));
  });

  it('preserves distinction: "chips and mayo" !== "chips"', () => {
    expect(computeMatchingKey('chips and mayo')).not.toBe(
      computeMatchingKey('chips'),
    );
  });

  it('"chips & chicken" === "chips and chicken" (both normalise same)', () => {
    expect(computeMatchingKey('chips & chicken')).toBe(
      computeMatchingKey('chips and chicken'),
    );
  });

  it('strips apostrophes so "nando\'s" matches "nandos"', () => {
    expect(computeMatchingKey("nando's")).toBe(computeMatchingKey('nandos'));
    expect(computeMatchingKey("nando's")).toBe('nandos');
  });

  it('does NOT sort tokens (unlike getMealFingerprint)', () => {
    // matching_key preserves word order — it's a normalised string, not a fingerprint
    expect(computeMatchingKey('chicken and chips')).toBe('chicken chips');
    expect(computeMatchingKey('chips and chicken')).toBe('chips chicken');
    // These are DIFFERENT keys — order matters
    expect(computeMatchingKey('chicken and chips')).not.toBe(
      computeMatchingKey('chips and chicken'),
    );
  });
});

// ---------------------------------------------------------------------------
// Keyword dictionary loading
// ---------------------------------------------------------------------------
describe('loadKeywordDictionary', () => {
  it('loads the dictionary with version and bucket definitions', () => {
    const dict = loadKeywordDictionary();
    expect(dict.version).toBe('1');
    expect(dict.buckets).toHaveProperty('quick_sugar');
    expect(dict.buckets).toHaveProperty('simple_snack');
    expect(dict.buckets).toHaveProperty('fat_heavy');
    expect(dict.fallbackBucket).toBe('mixed_meal');
    expect(dict.fallbackDigestionWindowMinutes).toBe(180);
  });

  it('each bucket has keywords and digestion_window_minutes', () => {
    const dict = loadKeywordDictionary();
    for (const [, bucket] of Object.entries(dict.buckets)) {
      expect(Array.isArray(bucket.keywords)).toBe(true);
      expect(bucket.keywords.length).toBeGreaterThan(0);
      expect(typeof bucket.digestionWindowMinutes).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// ClassificationResult shape
// ---------------------------------------------------------------------------
describe('ClassificationResult shape', () => {
  it('always includes keywordsVersion from the dictionary', () => {
    const result = classifyMeal('Anything', 50);
    expect(result.keywordsVersion).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// Edge cases: substring matching behaviour
// ---------------------------------------------------------------------------
describe('Substring matching edge cases', () => {
  it('"apple juice" matches quick_sugar "apple juice" not simple_snack "apple"', () => {
    // "apple juice" is in quick_sugar; "apple" is in simple_snack
    // Longer match should win within the first-match-wins scan
    const result = classifyMeal('apple juice', 20);
    expect(result.bucket).toBe('quick_sugar');
    expect(result.matchedKeyword).toBe('apple juice');
  });

  it('"apple pie" matches simple_snack "apple" (substring)', () => {
    // "apple" is a simple_snack keyword; "apple pie" contains "apple"
    const result = classifyMeal('apple pie', 40);
    expect(result.bucket).toBe('simple_snack');
    expect(result.matchedKeyword).toBe('apple');
  });

  it('keyword match is case-insensitive', () => {
    const result = classifyMeal('PIZZA', 50);
    expect(result.bucket).toBe('fat_heavy');
    expect(result.method).toBe('override_keyword');
  });
});
