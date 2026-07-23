const VIRTUAL_AUTHENTICATOR_AAGUIDS = new Set(['01020304-0506-0708-0102-030405060708']);

export function isVirtualAuthenticator(aaguid: string | null | undefined): boolean {
  return typeof aaguid === 'string' && VIRTUAL_AUTHENTICATOR_AAGUIDS.has(aaguid.toLowerCase());
}
