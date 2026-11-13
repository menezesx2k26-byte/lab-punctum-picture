import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// Session payloads are small. Compute their HMAC without queueing a libuv job.
export function createAdminSessionKey(material) {
  const sign = (payload) => createHmac('sha256', material).update(payload).digest();
  return {
    sign,
    verify(payload, signature) {
      const expected = sign(payload);
      return signature.byteLength === expected.byteLength && timingSafeEqual(expected, signature);
    },
  };
}

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
