/**
 * Classification Engine — Session Grouping V2, Phase B
 * Spec: Session Grouping Design Spec, Section 2 (Classification) + Section 7.1 (matching_key)
 *
 * Pure functions. No side effects, no storage writes, no network calls.
 * Integrated into saveMeal() in Phase H.
 */
import { ClassificationBucket, ClassificationMethod } from './storage';
import keywordData from '../data/classification-keywords.json';

// --- Types ---

export interface ClassificationResult {
  bucket: ClassificationBucket;
  method: ClassificationMethod;
  matchedKeyword: string | null;
  keywordsVersion: string;
  digestionWindowMinutes: number;
}

export interface KeywordBucket {
  keywords: string[];
  digestionWindowMinutes: number;
}

export interface KeywordDictionary {
  version: string;
  buckets: Record<string, KeywordBucket>;
  fallbackBucket: ClassificationBucket;
  fallbackDigestionWindowMinutes: number;
}

// --- Carb bucket thresholds (Section 2) ---
// <15g → quick_sugar, 15-30g → simple_snack, >30g → mixed_meal
// fat_heavy is override-keyword-only (never assigned by carbs)

const CARB_THRESHOLDS: Array<{
  maxCarbs: number;
  bucket: ClassificationBucket;
  windowMinutes: number;
}> = [
  { maxCarbs: 14.99, bucket: 'quick_sugar', windowMinutes: 60 },
  { maxCarbs: 30, bucket: 'simple_snack', windowMinutes: 90 },
  // >30g falls through to mixed_meal (handled as default)
];

const MIXED_MEAL_WINDOW = 180;

// --- Bucket scan order for override keywords (Section 2: first-match-wins) ---
// Order: quick_sugar → simple_snack → fat_heavy
// mixed_meal has no override keywords
const BUCKET_SCAN_ORDER: ClassificationBucket[] = [
  'quick_sugar',
  'simple_snack',
  'fat_heavy',
];

// --- Conjunction stop list for matching_key (Section 7.1) ---
const CONJUNCTIONS = new Set(['with', 'and', '&', 'plus', '+']);

// --- Public API ---

/**
 * Load the keyword dictionary from the bundled JSON file.
 * Returns a structured dictionary with version, buckets, and fallback config.
 */
export function loadKeywordDictionary(): KeywordDictionary {
  const raw = keywordData as {
    version: string;
    buckets: Record<string, { digestion_window_minutes: number; keywords: string[] }>;
    fallback_bucket: string;
    fallback_digestion_window_minutes: number;
  };

  const buckets: Record<string, KeywordBucket> = {};
  for (const [name, bucket] of Object.entries(raw.buckets)) {
    buckets[name] = {
      keywords: bucket.keywords,
      digestionWindowMinutes: bucket.digestion_window_minutes,
    };
  }

  return {
    version: raw.version,
    buckets,
    fallbackBucket: raw.fallback_bucket as ClassificationBucket,
    fallbackDigestionWindowMinutes: raw.fallback_digestion_window_minutes,
  };
}

/**
 * Classify a meal into a digestion window bucket.
 * Spec Section 2: first-match-wins rule order:
 *   1. Name contains an override keyword → use override bucket
 *   2. Otherwise → use carb bucket
 *   3. If carbs unknown → fallback to mixed_meal (180 min)
 *
 * Override keywords are case-insensitive substring matches.
 * Within override scanning, buckets are checked in order: quick_sugar → simple_snack → fat_heavy.
 * Within each bucket, longer keywords are checked first to prefer specific matches
 * (e.g. "apple juice" before "apple").
 */
export function classifyMeal(
  name: string,
  carbsGrams: number | null,
): ClassificationResult {
  const dict = loadKeywordDictionary();
  const nameLower = name.toLowerCase();

  // Step 1: Override keyword scan (first-match-wins across buckets)
  for (const bucketName of BUCKET_SCAN_ORDER) {
    const bucket = dict.buckets[bucketName];
    if (!bucket) continue;

    // Sort keywords longest-first for most-specific match
    const sortedKeywords = [...bucket.keywords].sort(
      (a, b) => b.length - a.length,
    );

    for (const keyword of sortedKeywords) {
      if (nameLower.includes(keyword.toLowerCase())) {
        return {
          bucket: bucketName,
          method: 'override_keyword',
          matchedKeyword: keyword,
          keywordsVersion: dict.version,
          digestionWindowMinutes: bucket.digestionWindowMinutes,
        };
      }
    }
  }

  // Step 2: Carb bucket (if carbs known)
  if (carbsGrams !== null) {
    for (const threshold of CARB_THRESHOLDS) {
      if (carbsGrams <= threshold.maxCarbs) {
        return {
          bucket: threshold.bucket,
          method: 'carb_bucket',
          matchedKeyword: null,
          keywordsVersion: dict.version,
          digestionWindowMinutes: threshold.windowMinutes,
        };
      }
    }
    // >30g → mixed_meal
    return {
      bucket: 'mixed_meal',
      method: 'carb_bucket',
      matchedKeyword: null,
      keywordsVersion: dict.version,
      digestionWindowMinutes: MIXED_MEAL_WINDOW,
    };
  }

  // Step 3: Fallback (carbs unknown, no keyword match)
  return {
    bucket: dict.fallbackBucket,
    method: 'fallback',
    matchedKeyword: null,
    keywordsVersion: dict.version,
    digestionWindowMinutes: dict.fallbackDigestionWindowMinutes,
  };
}

/**
 * Compute a normalised matching key for pattern matching.
 * Spec Section 7.1: Option B — normalised string match.
 *
 * Rules:
 * - Lowercase
 * - Trim whitespace
 * - Collapse multiple spaces to single space
 * - Strip trailing/leading punctuation
 * - Strip conjunctions only: "with", "and", "&", "plus", "+"
 * - Do NOT strip ingredient words — if the user typed it, it matters
 * - Do NOT sort tokens — word order is preserved
 *
 * Stored on meal row at save time. NOT computed at query time.
 */
export function computeMatchingKey(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Strip all non-alphanumeric, non-space characters (punctuation, apostrophes, quotes)
    .replace(/[^a-z0-9\s]/g, '')
    // Split into tokens
    .split(/\s+/)
    // Remove conjunction stop words
    .filter((word) => word.length > 0 && !CONJUNCTIONS.has(word))
    // Rejoin with single spaces
    .join(' ')
    .trim();
}
