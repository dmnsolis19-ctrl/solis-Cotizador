const encoder = new TextEncoder();
// Cloudflare Workers rejects a single PBKDF2 operation above 100,000 rounds.
// Keep the application's 210,000-round work factor by chaining allowed rounds.
const MAX_PBKDF2_ROUNDS_PER_DERIVATION = 100_000;

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function newSalt() {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPassword(password: string, salt: string, iterations = 210000) {
  let remaining = iterations;
  let material = encoder.encode(password);

  while (remaining > 0) {
    const rounds = Math.min(remaining, MAX_PBKDF2_ROUNDS_PER_DERIVATION);
    const key = await crypto.subtle.importKey("raw", material, "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations: rounds },
      key,
      256,
    );
    material = new Uint8Array(bits);
    remaining -= rounds;
  }

  return bytesToBase64(material);
}

export function secureEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
