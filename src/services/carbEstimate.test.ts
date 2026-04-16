import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRemainingEstimates, estimateCarbsFromPhoto, RateLimitError, ConsentRequiredError } from './carbEstimate';

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
  it('returns result text on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: '45g carbs' }),
    });
    const result = await estimateCarbsFromPhoto('file:///photo.jpg');
    expect(result).toBe('45g carbs');
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
