import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { makeApp } from '../dist/src/app.js'

test('registration verifies email before onboarding, with resend and cross-browser confirmation', async t => {
  const url = new URL(process.env.DATABASE_URL)
  assert.match(process.env.TEST_DB_NAME, /^eq_test_[0-9a-f]{12}$/)
  assert.equal(url.pathname, '/' + process.env.TEST_DB_NAME)
  assert.equal(url.host, process.env.TEST_DB_ADDR)
  assert.equal(url.hostname, '127.0.0.1')

  const sent = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://api.resend.com/emails')
    const body = JSON.parse(init.body)
    sent.push(body)
    return new Response(JSON.stringify({ id: randomUUID() }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    })
  }
  const origin = 'http://127.0.0.1:3000'
  const { app, db } = await makeApp({
    DATABASE_URL: url.href, APP_ORIGIN: origin, PORT: 3000,
    SESSION_SECRET: randomBytes(32).toString('hex'),
    RESEND_API_KEY: 'test-only', MAIL_FROM: 'test@example.test'
  })
  t.after(async () => { globalThis.fetch = originalFetch; await app.close() })

  const jar = {}
  let csrf
  async function call(method, path, payload) {
    const response = await app.inject({
      method, url: path, remoteAddress: '127.0.0.1',
      headers: { host: '127.0.0.1:3000', origin, ...(csrf && { 'x-csrf-token': csrf }) },
      cookies: jar, payload
    })
    for (const cookie of response.cookies) {
      if (cookie.value) jar[cookie.name] = cookie.value
      else delete jar[cookie.name]
    }
    const json = response.body ? response.json() : {}
    if (json.csrf) csrf = json.csrf
    return { status: response.statusCode, body: json }
  }
  function tokenFromMail() {
    const match = sent.at(-1)?.text.match(/\/owner\/verify#([a-f0-9]{64})/)
    assert.ok(match, 'verification email contains a standalone secure link')
    return match[1]
  }

  const credentials = { email: randomUUID() + '@example.test', password: randomBytes(24).toString('hex') }
  const profile = { name: 'Verification business', city: 'Pavlodar', phone: '+77000000001', slug: 'verify-' + randomBytes(5).toString('hex') }

  assert.equal((await call('GET', '/api/auth/session')).body.owner, null)
  const registered = await call('POST', '/api/auth/register', credentials)
  assert.equal(registered.status, 201)
  assert.equal(registered.body.verificationDelivery, 'accepted')
  assert.equal(sent.length, 1)
  assert.equal((await call('GET', '/api/auth/session')).body.owner.verifiedAt, null)

  const blocked = await call('POST', '/api/owner/business', profile)
  assert.equal(blocked.status, 403)
  assert.equal(blocked.body.error.code, 'VERIFY')
  assert.equal(await db.business.count({ where: { slug: profile.slug } }), 0)

  const originalToken = tokenFromMail()
  assert.equal((await call('POST', '/api/owner/verify', {})).status, 200)
  assert.equal(sent.length, 2)
  const latestToken = tokenFromMail()
  assert.notEqual(latestToken, originalToken)
  assert.equal((await call('POST', '/api/auth/confirm', { token: originalToken })).status, 400)

  assert.equal((await call('POST', '/api/auth/logout', {})).status, 204)
  assert.equal((await call('GET', '/api/auth/session')).body.owner, null)
  // Email proof is sufficient: link may be opened on a different device.
  assert.equal((await call('POST', '/api/auth/confirm', { token: latestToken })).status, 200)
  assert.equal((await call('POST', '/api/auth/confirm', { token: latestToken })).status, 400)

  assert.equal((await call('POST', '/api/auth/login', credentials)).status, 200)
  assert.ok((await call('GET', '/api/auth/session')).body.owner.verifiedAt)
  assert.equal((await call('POST', '/api/owner/business', profile)).status, 201)
})
