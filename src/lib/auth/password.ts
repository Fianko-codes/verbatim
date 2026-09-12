import { type ScryptOptions, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

/**
 * `promisify` drops the options overload, so wrap it by hand rather than
 * casting the call sites.
 */
const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)));
  });

/**
 * Password hashing with scrypt from Node's standard library — a memory-hard
 * KDF, so no native dependency and nothing to keep patched.
 *
 * N = 2^15 with r = 8 costs ~32 MB and ~100 ms per verification, which is the
 * usual interactive-login target and well inside a serverless function's
 * budget. `maxmem` has to be raised explicitly: Node's 32 MB default is exactly
 * the amount 128 * N * r needs, and it rejects at the boundary.
 */
const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 96 * 1024 * 1024;

const derive = (password: string, salt: Buffer) =>
  scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });

/** Returns `scrypt$N$r$p$salt$hash`, both parts base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

/**
 * Constant-time verification. Any malformed stored value fails closed rather
 * than throwing, so a corrupt row cannot become an authentication bypass.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
    const n = Number(nStr);
    const r = Number(rStr);
    const p = Number(pStr);
    if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
    // Guard against a hostile row asking for an unbounded allocation.
    if (n < 1024 || n > 1 << 20 || r < 1 || r > 32 || p < 1 || p > 16) return false;
    const salt = Buffer.from(saltB64, "base64url");
    const expected = Buffer.from(hashB64, "base64url");
    if (salt.length === 0 || expected.length === 0) return false;
    const actual = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: MAXMEM,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * Burn roughly the same time as a real verification when the username does not
 * exist, so response timing does not reveal which accounts are registered.
 */
export async function fakeVerify(): Promise<void> {
  await derive("verbatim-no-such-account", Buffer.alloc(16, 7));
}
