import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const keyPattern = /^[0-9a-f]{64}$/i

export function newTotpSecret(): string {
  const bytes = randomBytes(20)
  let bits = 0, buffer = 0, result = ''
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      result += alphabet[(buffer >>> (bits -= 5)) & 31]
    }
  }
  if (bits) result += alphabet[(buffer << (5 - bits)) & 31]
  return result
}

function decodeBase32(input: string): Buffer {
  if (!/^[A-Z2-7]{32}$/.test(input)) throw new Error('Invalid TOTP secret')
  const bytes: number[] = []
  let bits = 0, buffer = 0
  for (const char of input) {
    buffer = (buffer << 5) | alphabet.indexOf(char)
    bits += 5
    if (bits >= 8) bytes.push((buffer >>> (bits -= 8)) & 255)
  }
  return Buffer.from(bytes)
}

export function totpAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest()
  const offset = digest[digest.length - 1] & 15
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0')
}

/** A previously accepted time step can never be used again, even on another session. */
export function verifyTotp(secret: string, code: string, now = Date.now(), lastStep = -1): number | null {
  if (!/^\d{6}$/.test(code)) return null
  const current = Math.floor(now / 30000)
  for (const step of [current, current - 1, current + 1]) {
    if (step <= lastStep || step < 0) continue
    if (timingSafeEqual(Buffer.from(totpAt(secret, step)), Buffer.from(code))) return step
  }
  return null
}

export function encryptTotp(secret: string, keyHex: string): string {
  if (!keyPattern.test(keyHex)) throw new Error('Invalid TOTP encryption key')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv)
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.')
}

export function decryptTotp(value: string, keyHex: string): string {
  if (!keyPattern.test(keyHex)) throw new Error('Invalid TOTP encryption key')
  const parts = value.split('.')
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Invalid TOTP ciphertext')
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), Buffer.from(parts[1], 'base64url'))
  decipher.setAuthTag(Buffer.from(parts[2], 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64url')), decipher.final()]).toString('utf8')
}

export function totpUri(email: string, secret: string): string {
  const issuer = 'EndQuote Admin'
  return 'otpauth://totp/' + encodeURIComponent(issuer + ':' + email) +
    '?secret=' + secret + '&issuer=' + encodeURIComponent(issuer) + '&algorithm=SHA1&digits=6&period=30'
}
