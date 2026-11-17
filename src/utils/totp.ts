import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Generate a random Base32 TOTP secret key (RFC 3548 / RFC 6238)
 */
export function generateTOTPSecret(length = 20): string {
  const randomBytes = crypto.randomBytes(length);
  let bits = '';
  for (let i = 0; i < randomBytes.length; i++) {
    bits += randomBytes[i].toString(2).padStart(8, '0');
  }
  let secret = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    const chunk = bits.substr(i, 5);
    secret += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return secret;
}

/**
 * Decode Base32 string to Buffer
 */
export function base32ToBuffer(base32: string): Buffer {
  let bits = '';
  const clean = base32.replace(/=+$/, '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  for (let i = 0; i < clean.length; i++) {
    const val = BASE32_ALPHABET.indexOf(clean[i]);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substr(i, 8), 2));
  }
  return Buffer.from(bytes);
}

/**
 * Generate a 6-digit TOTP code for a given timestamp
 */
export function generateTOTP(secret: string, timeStep = 30, digits = 6, time = Date.now()): string {
  const key = base32ToBuffer(secret);
  const counter = Math.floor(time / 1000 / timeStep);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, '0');
}

/**
 * Verify a 6-digit TOTP code within a drift window (default ±30s)
 */
export function verifyTOTP(token: string, secret: string, window = 1): boolean {
  if (!token || !secret) return false;
  const cleanToken = token.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleanToken)) return false;

  const now = Date.now();
  for (let i = -window; i <= window; i++) {
    const expected = generateTOTP(secret, 30, 6, now + i * 30000);
    if (expected === cleanToken) return true;
  }
  return false;
}

/**
 * Format standard otpauth:// URI for authenticator QR codes
 */
export function getOtpAuthUrl(email: string, secret: string, issuer = 'AuraPrep'): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

