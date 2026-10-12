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

/**
 * ONE backend URL for the whole app.
 * Only an https:// value from EXPO_PUBLIC_BACKEND_URL is accepted, so a local
 * http://10.x.x.x address can never end up inside the APK again.
 */
export const API_URL: string = (() => {
  const env = String(process.env.EXPO_PUBLIC_BACKEND_URL || '').trim();
  if (/^https:\/\//i.test(env)) return env.replace(/\/+$/, '');
  return 'https://wsapp-9w4r.onrender.com';
})();

const USER_KEYS = ['wsUser', 'user', 'userData', 'wsappUser'] as const;
const TOKEN_KEYS = ['wsToken', 'token', 'idToken', 'wsAuthToken'] as const;
const REFRESH_KEY = 'wsRefreshToken';
const EXPIRY_KEY = 'wsTokenExp';
const CLIENT_KEY = 'wsComplaintClientKey';

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

async function setValue(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // Ignore, web copy below may still work.
  }
  const web = getWebStorage();
  if (web) {
    try {
      web.setItem(key, value);
    } catch {
      // Ignore.
    }
  }
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

/** Called by the login screen: saves user + token + refresh token + expiry time. */
export async function saveSession(
  user: StoredUser,
  token?: string | null,
  refreshToken?: string | null,
  expiresInSec?: number | string | null
): Promise<void> {
  await setValue('wsUser', JSON.stringify(user));
  if (token) await setValue('wsToken', String(token));
  if (refreshToken) await setValue(REFRESH_KEY, String(refreshToken));
  const secs = Number(expiresInSec || 3600);
  await setValue(EXPIRY_KEY, String(Date.now() + secs * 1000));
}

export async function clearSession(): Promise<void> {
  const allKeys = [...USER_KEYS, ...TOKEN_KEYS, REFRESH_KEY, EXPIRY_KEY];

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

// ---------------------------------------------------------------------------
// Token refresh (Firebase tokens expire after 1 hour; refresh token does not)
// ---------------------------------------------------------------------------

type RefreshResult = { token: string | null; invalid: boolean };

let refreshInFlight: Promise<RefreshResult> | null = null;

async function doRefresh(timeoutMs: number): Promise<RefreshResult> {
  const refreshToken = (await getUserStorage(REFRESH_KEY)) || '';
  if (!refreshToken) return { token: null, invalid: true };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}/api/token/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data?.success && data?.token) {
      await setValue('wsToken', String(data.token));
      if (data.refreshToken) await setValue(REFRESH_KEY, String(data.refreshToken));
      const secs = Number(data.expiresIn || 3600);
      await setValue(EXPIRY_KEY, String(Date.now() + secs * 1000));
      return { token: String(data.token), invalid: false };
    }
    // 401 = the refresh token itself is dead (password changed, account disabled...)
    return { token: null, invalid: res.status === 401 };
  } catch {
    // Offline / server asleep: not the user's fault, keep the session.
    return { token: null, invalid: false };
  } finally {
    clearTimeout(timer);
  }
}

export async function refreshSessionToken(timeoutMs = 20000): Promise<RefreshResult> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh(timeoutMs).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/** Returns a valid token. Refreshes it first if it is expired or about to expire. */
export async function getFreshToken(timeoutMs = 20000): Promise<string> {
  const token = await getSessionToken();
  const exp = Number((await getUserStorage(EXPIRY_KEY)) || 0);
  const hasRefresh = !!(await getUserStorage(REFRESH_KEY));

  if (token && exp && exp - Date.now() > 5 * 60 * 1000) return token;
  if (!hasRefresh) return token; // old session without refresh token

  const r = await refreshSessionToken(timeoutMs);
  return r.token || token;
}

/** fetch() with the login token attached. On 401 it refreshes the token and retries once. */
export async function authFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = 45000
): Promise<Response> {
  const run = async (token: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        ...init,
        headers: {
          ...((init.headers as Record<string, string>) || {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let res = await run(await getFreshToken());
  if (res.status === 401) {
    const r = await refreshSessionToken();
    if (r.token) res = await run(r.token);
  }
  return res;
}

/**
 * Used by the splash screen. true = go to Home, false = go to Login.
 * - no user / no token / no refresh token (old session) -> Login
 * - refresh token rejected by server -> clear session -> Login
 * - server asleep or offline -> keep session, go Home (it refreshes later)
 */
export async function validateSession(): Promise<boolean> {
  const { user, token } = await loadSession();
  if (!user || !token) return false;

  const hasRefresh = !!(await getUserStorage(REFRESH_KEY));
  if (!hasRefresh) {
    await clearSession();
    return false;
  }

  const exp = Number((await getUserStorage(EXPIRY_KEY)) || 0);
  if (exp && exp - Date.now() > 5 * 60 * 1000) return true;

  const r = await refreshSessionToken(8000);
  if (r.token) return true;
  if (r.invalid) {
    await clearSession();
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Anonymous report key (works on Android AND web; the old code used web-only localStorage)
// ---------------------------------------------------------------------------

export async function getClientKey(): Promise<string> {
  const existing = await getUserStorage(CLIENT_KEY);
  if (existing && existing.length >= 20) return existing;

  const generated = `ws-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
  await setValue(CLIENT_KEY, generated);
  return generated;
}

// ---------------------------------------------------------------------------
// Emergency contacts: cloud copy (same data on web + mobile). Local copy stays as cache.
// ---------------------------------------------------------------------------

export function contactsKeyFor(user: StoredUser | null | undefined): string {
  const id = String(user?.uid || user?.id || user?.email || user?.phone || 'guest').trim().toLowerCase();
  return `wsapp_emergency_contacts_${id}`;
}

export async function pushContactsToServer(contacts: unknown[]): Promise<void> {
  try {
    await authFetch(`${API_URL}/api/contacts`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacts }),
    });
  } catch {
    // Offline: local copy is kept, it syncs on the next save / login.
  }
}

/** Download contacts from the server into local storage. If the server is empty but this device has some, upload them. */
export async function syncContactsWithServer(): Promise<unknown[] | null> {
  try {
    const { user } = await loadSession();
    if (!user) return null;
    const key = contactsKeyFor(user);

    const res = await authFetch(`${API_URL}/api/contacts`, {}, 30000);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return null;

    const remote: unknown[] = Array.isArray(data.contacts) ? data.contacts : [];
    if (remote.length > 0) {
      await setValue(key, JSON.stringify(remote));
      return remote;
    }

    const localRaw = await getUserStorage(key);
    const local = localRaw ? JSON.parse(localRaw) : [];
    if (Array.isArray(local) && local.length > 0) {
      await pushContactsToServer(local);
      return local;
    }
    return [];
  } catch {
    return null;
  }
}