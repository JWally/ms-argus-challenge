const STORAGE_KEY = 'argus-challenge:device-trust';

export function loadDeviceTrust(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveDeviceTrust(token: string | null): void {
  if (!token) return;
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // A missing cache only means the next run performs fresh proof.
  }
}

export function clearDeviceTrust(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // A failed cleanup is handled by server-side token validation.
  }
}
