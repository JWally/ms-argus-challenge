export interface PairBlob {
  sessionId: string;
  wsUrl: string;
  e: string;
  pt: string;
  n: string;
  proofRequired: boolean;
  freshProofRequired: boolean;
}

export interface PhoneBinding {
  wsUrl: string;
  desktopEnvelope: string;
  phoneToken: string;
  nonce: string;
  proofRequired: boolean;
  freshProofRequired: boolean;
}

export function pairBlobToFragment(blob: PairBlob): string {
  return new URLSearchParams({
    wsUrl: blob.wsUrl,
    e: blob.e,
    pt: blob.pt,
    n: blob.n,
    pr: blob.proofRequired ? '1' : '0',
    fr: blob.freshProofRequired ? '1' : '0',
  }).toString();
}

export function readPhoneBinding(hash: string): PhoneBinding {
  const values = new URLSearchParams(hash.replace(/^#/, ''));
  const wsUrl = values.get('wsUrl');
  const desktopEnvelope = values.get('e');
  const phoneToken = values.get('pt');
  const nonce = values.get('n');
  if (!wsUrl || !desktopEnvelope || !phoneToken || !nonce) {
    throw new Error('pair_binding_invalid');
  }
  return {
    wsUrl,
    desktopEnvelope,
    phoneToken,
    nonce,
    proofRequired: values.get('pr') !== '0',
    freshProofRequired: values.get('fr') === '1',
  };
}
