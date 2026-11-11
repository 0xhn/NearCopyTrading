import { x25519 } from "@noble/curves/ed25519.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface ViewingKey {
  secretB64: string;
  publicHex: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (clean.length % 2 !== 0) throw new Error("公钥长度无效");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function rawBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function b64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function storageKey(accountId: string): string {
  return `keycopy.x25519.${accountId}`;
}

export function loadViewingKey(accountId: string): ViewingKey | null {
  const raw = localStorage.getItem(storageKey(accountId));
  if (!raw) return null;
  return JSON.parse(raw) as ViewingKey;
}

export function saveViewingKey(accountId: string, key: ViewingKey) {
  localStorage.setItem(storageKey(accountId), JSON.stringify(key));
}

export function createViewingKey(accountId: string): ViewingKey {
  const { secretKey, publicKey } = x25519.keygen();
  const key = { secretB64: bytesToB64(secretKey), publicHex: bytesToHex(publicKey) };
  saveViewingKey(accountId, key);
  return key;
}

export function viewingKeyFor(accountId: string): ViewingKey {
  return loadViewingKey(accountId) ?? createViewingKey(accountId);
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", rawBuffer(bytes));
  return new Uint8Array(digest);
}

async function aesEncrypt(keyBytes: Uint8Array, plain: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", rawBuffer(keyBytes), "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, rawBuffer(plain)));
  const packed = new Uint8Array(iv.length + cipher.length);
  packed.set(iv, 0);
  packed.set(cipher, iv.length);
  return packed;
}

async function aesDecrypt(keyBytes: Uint8Array, packed: Uint8Array): Promise<Uint8Array> {
  const iv = packed.slice(0, 12);
  const cipher = packed.slice(12);
  const key = await crypto.subtle.importKey("raw", rawBuffer(keyBytes), "AES-GCM", false, ["decrypt"]);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, rawBuffer(cipher)));
}

export async function sealSignal(
  plaintext: string,
  subscribers: Array<{ buyer: string; publicHex: string }>,
): Promise<{ ciphertext: string; wraps: Array<{ buyer: string; wrapped_key: string }> }> {
  const epoch = crypto.getRandomValues(new Uint8Array(32));
  const ciphertext = bytesToB64(await aesEncrypt(epoch, encoder.encode(plaintext)));
  const wraps = [];
  for (const subscriber of subscribers) {
    const ephemeral = x25519.keygen();
    const shared = x25519.getSharedSecret(ephemeral.secretKey, hexToBytes(subscriber.publicHex));
    const wrapped = await aesEncrypt(await sha256(shared), epoch);
    const packed = new Uint8Array(ephemeral.publicKey.length + wrapped.length);
    packed.set(ephemeral.publicKey, 0);
    packed.set(wrapped, ephemeral.publicKey.length);
    wraps.push({ buyer: subscriber.buyer, wrapped_key: bytesToB64(packed) });
  }
  return { ciphertext, wraps };
}

export async function openSignal(ciphertextB64: string, wrappedB64: string, secretB64: string): Promise<string> {
  const secret = b64ToBytes(secretB64);
  const packed = b64ToBytes(wrappedB64);
  const shared = x25519.getSharedSecret(secret, packed.slice(0, 32));
  const epoch = await aesDecrypt(await sha256(shared), packed.slice(32));
  const plain = await aesDecrypt(epoch, b64ToBytes(ciphertextB64));
  return decoder.decode(plain);
}
