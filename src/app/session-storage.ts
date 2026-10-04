import AsyncStorage from '@react-native-async-storage/async-storage';

export type StoredUser = {
  uid?: string;
  id?: string;
  fullName?: string;
  name?: string;
  phone?: string;
  email?: string;
  [key: string]: unknown;
};

const USER_KEYS = ['wsUser', 'user', 'userData', 'wsappUser'] as const;
const TOKEN_KEYS = ['wsToken', 'token', 'idToken', 'wsAuthToken'] as const;

function getWebStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Ignore web storage errors.
  }
  return null;
}

async function getFirstValue(keys: readonly string[]): Promise<string | null> {
  for (const key of keys) {
    try {
      const value = await AsyncStorage.getItem(key);
      if (value) return value;
    } catch {
      // Continue to the next key.
    }
  }

  const webStorage = getWebStorage();
  if (webStorage) {
    for (const key of keys) {
      try {
        const value = webStorage.getItem(key);
        if (value) return value;
      } catch {
        // Continue to the next key.
      }
    }
  }

  return null;
}

export async function loadSession(): Promise<{
  user: StoredUser | null;
  token: string;
}> {
  const [rawUser, token] = await Promise.all([
    getFirstValue(USER_KEYS),
    getFirstValue(TOKEN_KEYS),
  ]);

  let user: StoredUser | null = null;

  if (rawUser) {
    try {
      const parsed = JSON.parse(rawUser);
      if (parsed && typeof parsed === 'object') {
        user = parsed as StoredUser;
      }
    } catch {
      user = null;
    }
  }

  return { user, token: token ?? '' };
}

export async function getUserStorage(key: string): Promise<string | null> {
  try {
    const value = await AsyncStorage.getItem(key);
    if (value !== null) return value;
  } catch {
    // Fall through to web storage.
  }

  const webStorage = getWebStorage();
  if (webStorage) {
    try {
      return webStorage.getItem(key);
    } catch {
      // Ignore storage errors.
    }
  }

  return null;
}

export async function getSessionToken(): Promise<string> {
  return (await getFirstValue(TOKEN_KEYS)) ?? '';
}

export async function clearSession(): Promise<void> {
  const allKeys = [...USER_KEYS, ...TOKEN_KEYS];

  await Promise.all(
    allKeys.map(async (key) => {
      try {
        await AsyncStorage.removeItem(key);
      } catch {
        // Ignore individual storage errors.
      }
    })
  );

  const webStorage = getWebStorage();
  if (webStorage) {
    for (const key of allKeys) {
      try {
        webStorage.removeItem(key);
      } catch {
        // Ignore individual storage errors.
      }
    }
  }
}
