import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRemainingEstimates, estimateCarbsFromPhoto, parseEstimateResponse, RateLimitError, ConsentRequiredError } from './carbEstimate';

// Mock global fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

// Mock expo-file-system File
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    base64: jest.fn().mockResolvedValue('fakeBase64Data'),
  })),
}));

// Mock supabase client
const mockGetUser = jest.fn();
const mockGetSession = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockIs = jest.fn();
const mockMaybeSingle = jest.fn();

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: () => mockGetUser(),
      getSession: () => mockGetSession(),
    },
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ maybeSingle: () => mockMaybeSingle() }) }) }) }),
    }),
  },
}));

function mockConsentGranted() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  mockMaybeSingle.mockResolvedValue({ data: { version: '1.0' }, error: null });
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } } });
}

function mockConsentMissing() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
}

beforeEach(() => {
  mockConsentGranted();
});

afterEach(async () => {
  mockFetch.mockReset();
  mockGetUser.mockReset();
  mockGetSession.mockReset();
  mockMaybeSingle.mockReset();
  await AsyncStorage.clear();
});

describe('getRemainingEstimates', () => {
  it('returns 10 when no usage exists', async () => {
    expect(await getRemainingEstimates()).toBe(10);
  });

  it('returns remaining count for today', async () => {
    const today = new Date().toISOString().split('T')[0];
    await AsyncStorage.setItem(
      'glucolog_carb_estimate_usage',
      JSON.stringify({ date: today, count: 7 }),
    );
    expect(await getRemainingEstimates()).toBe(3);
  });

  it('resets to 10 for a new day', async () => {
    await AsyncStorage.setItem(
      'glucolog_carb_estimate_usage',
      JSON.stringify({ date: '2020-01-01', count: 10 }),
    );
    expect(await getRemainingEstimates()).toBe(10);
  });
});

describe('estimateCarbsFromPhoto', () => {
  it('returns CarbEstimateResult on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: '45g\nChicken rice and vegetables\nBased on 200g rice...' }),
    });
    const result = await estimateCarbsFromPhoto('file:///photo.jpg');
    expect(result.text).toContain('45g');
    expect(result.mealDescription).toBe('Chicken rice and vegetables');
  });

  it('handles old format without description', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: '45g carbs' }),
    });
    const result = await estimateCarbsFromPhoto('file:///photo.jpg');
    expect(result.text).toBe('45g carbs');
    expect(result.mealDescription).toBeNull();
  });

  it('throws RateLimitError when daily limit is reached', async () => {
    const today = new Date().toISOString().split('T')[0];
    await AsyncStorage.setItem(
      'glucolog_carb_estimate_usage',
      JSON.stringify({ date: today, count: 10 }),
    );
    await expect(estimateCarbsFromPhoto('file:///photo.jpg')).rejects.toBeInstanceOf(RateLimitError);
  });

  it('throws on non-OK proxy response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' }),
    });
    await expect(estimateCarbsFromPhoto('file:///photo.jpg')).rejects.toThrow('Server error');
  });

  it('throws ConsentRequiredError when AI consent is missing', async () => {
    mockConsentMissing();
    await expect(estimateCarbsFromPhoto('file:///photo.jpg')).rejects.toBeInstanceOf(ConsentRequiredError);
  });
});

describe('parseEstimateResponse', () => {
  it('parses 3-line format: carbs, description, reasoning', () => {
    const result = parseEstimateResponse('45g\nChicken rice and vegetables\nBased on 200g of rice...');
    expect(result.text).toBe('45g\nBased on 200g of rice...');
    expect(result.mealDescription).toBe('Chicken rice and vegetables');
  });

  it('parses range format', () => {
    const result = parseEstimateResponse('40-50g\nToast with peanut butter\nTwo slices of wholemeal...');
    expect(result.text).toBe('40-50g\nTwo slices of wholemeal...');
    expect(result.mealDescription).toBe('Toast with peanut butter');
  });

  it('returns null description for single-line response', () => {
    const result = parseEstimateResponse('No food visible in this image.');
    expect(result.text).toBe('No food visible in this image.');
    expect(result.mealDescription).toBeNull();
  });

  it('returns null description for old format (no meal name line)', () => {
    const result = parseEstimateResponse('45g carbs from a plate of pasta');
    expect(result.mealDescription).toBeNull();
  });

  it('rejects line 2 that looks like a carb figure', () => {
    const result = parseEstimateResponse('45g\n30g sugars\nSome reasoning');
    expect(result.mealDescription).toBeNull();
  });
});
