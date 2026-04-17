// Mock supabase module
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}));

// Mock expo-file-system to prevent import errors from carbEstimate.ts
jest.mock('expo-file-system', () => ({
  File: jest.fn(),
}));

import { hasAIConsent, ConsentRequiredError } from '../services/carbEstimate';
import { supabase } from '../../lib/supabase';

const mockAuth = supabase.auth as { getUser: jest.Mock };
const mockFrom = supabase.from as jest.Mock;

const FAKE_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

let mockMaybeSingle: jest.Mock;

function setupQueryChain() {
  // Build fluent chain: from() -> select() -> eq() -> eq() -> is() -> maybeSingle()
  mockMaybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
  const mockIs = jest.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
  const mockEq2 = jest.fn().mockReturnValue({ is: mockIs });
  const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
  const mockSelect = jest.fn().mockReturnValue({ eq: mockEq1 });
  mockFrom.mockReturnValue({ select: mockSelect });
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: user signed in
  mockAuth.getUser.mockResolvedValue({ data: { user: { id: FAKE_USER_ID } } });
  setupQueryChain();
});

describe('hasAIConsent', () => {
  it('returns true when consent record exists with matching version and null revoked_at', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { version: '1.0' },
      error: null,
    });

    const result = await hasAIConsent();
    expect(result).toBe(true);
  });

  it('returns false when no consent record exists (maybeSingle returns null data)', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    const result = await hasAIConsent();
    expect(result).toBe(false);
  });

  it('returns false when user is not signed in', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: null } });

    const result = await hasAIConsent();
    expect(result).toBe(false);
  });

  it('returns false when supabase query returns an error', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'DB error', code: '500' },
    });

    const result = await hasAIConsent();
    expect(result).toBe(false);
  });
});

describe('ConsentRequiredError', () => {
  it('is an instance of Error with message "AI consent required"', () => {
    const err = new ConsentRequiredError();
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('AI consent required');
  });
});
