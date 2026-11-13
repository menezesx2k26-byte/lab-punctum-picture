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
