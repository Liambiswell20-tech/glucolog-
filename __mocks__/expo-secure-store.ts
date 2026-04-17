const store: Record<string, string> = {};
export const getItemAsync = jest.fn((k: string) => Promise.resolve(store[k] ?? null));
export const setItemAsync = jest.fn((k: string, value: string) => { store[k] = value; return Promise.resolve(); });
export const deleteItemAsync = jest.fn((k: string) => { delete store[k]; return Promise.resolve(); });
