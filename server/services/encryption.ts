import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.APP_ENCRYPTION_KEY;
  if (!key) {
    console.warn('[Encryption] APP_ENCRYPTION_KEY not set, using fallback key (NOT SECURE FOR PRODUCTION)');
    return crypto.createHash('sha256').update('shipflow-dev-key-not-for-production').digest();
  }
  return crypto.createHash('sha256').update(key).digest();
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `enc:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptToken(encryptedValue: string): string {
  if (!encryptedValue.startsWith('enc:')) {
    return encryptedValue;
  }

  const parts = encryptedValue.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted token format');
  }

  const [, ivHex, authTagHex, ciphertext] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith('enc:');
}
