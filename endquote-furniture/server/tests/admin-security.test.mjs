import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {newTotpSecret,totpAt,verifyTotp,encryptTotp,decryptTotp,totpUri} from '../dist/src/admin-security.js'

test('TOTP matches the RFC 6238 SHA1 vector and rejects replay',()=>{
  const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
  assert.equal(totpAt(secret,1),'287082')
  assert.equal(verifyTotp(secret,'287082',59000),1)
  assert.equal(verifyTotp(secret,'287082',59000,1),null)
  assert.equal(verifyTotp(secret,'badcode',59000),null)
})

test('admin enrollment secrets are encrypted and tampering fails closed',()=>{
  const secret=newTotpSecret()
  assert.match(secret,/^[A-Z2-7]{32}$/)
  const key=randomBytes(32).toString('hex')
  const encrypted=encryptTotp(secret,key)
  assert.equal(decryptTotp(encrypted,key),secret)
  assert.ok(!encrypted.includes(secret))
  assert.throws(()=>decryptTotp(encrypted,randomBytes(32).toString('hex')))
  const parts=encrypted.split('.')
  parts[3]='A'+parts[3].slice(1)
  assert.throws(()=>decryptTotp(parts.join('.'),key))
  assert.match(totpUri('admin@example.test',secret),/^otpauth:\/\/totp\/EndQuote/)
})
