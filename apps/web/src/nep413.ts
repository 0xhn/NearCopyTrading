const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const NONCE_MAGIC = Uint8Array.from([86, 40, 246, 198]);
const INTENTS_SALT = Uint8Array.from([0xe1, 0x10, 0xf3, 0x17]);

export function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      carry += digits[index] << 8;
      digits[index] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  return `${"1".repeat(zeros)}${digits.reverse().map((digit) => BASE58[digit]).join("")}`;
}

function writeUint64(view: DataView, offset: number, value: bigint) {
  view.setBigUint64(offset, value, true);
}

export function versionedNonce(start: Date, deadline: Date): Uint8Array {
  const random = new Uint8Array(15);
  writeUint64(new DataView(random.buffer), 0, BigInt(start.getTime()) * 1_000_000n);
  crypto.getRandomValues(random.subarray(8));
  const nonce = new Uint8Array(32);
  nonce.set(NONCE_MAGIC, 0);
  nonce[4] = 0;
  nonce.set(INTENTS_SALT, 5);
  writeUint64(new DataView(nonce.buffer), 9, BigInt(deadline.getTime()) * 1_000_000n);
  nonce.set(random, 17);
  return nonce;
}

export function ed25519Signature(signature: string): string {
  const body = signature.startsWith("ed25519:") ? signature.slice("ed25519:".length) : signature;
  if (/^[A-Za-z0-9+/]+={1,2}$/.test(body)) {
    const bytes = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
    if (bytes.length === 64) return `ed25519:${base58Encode(bytes)}`;
  }
  return `ed25519:${body}`;
}

export function ed25519Key(publicKey: string): string {
  return publicKey.startsWith("ed25519:") ? publicKey : `ed25519:${publicKey}`;
}
