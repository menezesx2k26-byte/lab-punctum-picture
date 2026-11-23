export async function createAdminSessionKey(material) {
  const subtle = crypto.subtle;
  const key = await subtle.importKey(
    'raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'],
  );
  return {
    async sign(payload) {
      return new Uint8Array(await subtle.sign('HMAC', key, payload));
    },
    verify(payload, signature) {
      return subtle.verify('HMAC', key, signature, payload);
    },
  };
}

export async function sha256Hex(bytes) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
