import assert from 'node:assert/strict'
import test from 'node:test'

async function client(t, responses) {
  const { api } = await import('../src/owner/api.ts?' + encodeURIComponent(t.name))
  const requests = []
  t.mock.method(globalThis, 'fetch', async (path, init) => {
    requests.push({ path, ...init })
    assert.ok(responses.length, 'Unexpected request to ' + path)
    const { body, status = 200 } = responses.shift()
    return Response.json(body, { status })
  })
  return { api, requests }
}
const session = (id, csrf) => ({ body: { owner: id ? { id } : null, csrf } })
const rejected = (code, status) => ({ status, body: { error: { code, message: code } } })

test('a rejected owner write renews the token once for the same owner', async t => {
  const { api, requests } = await client(t, [
    session('owner-a', 'first'), rejected('CSRF', 403), session('owner-a', 'renewed'), { body: { revision: 2 } },
  ])
  await api('auth/session')
  assert.deepEqual(await api('owner/catalog', 'PUT', { revision: 1 }), { revision: 2 })
  assert.deepEqual(requests.map(r => r.path), ['/api/auth/session', '/api/owner/catalog', '/api/auth/session', '/api/owner/catalog'])
  assert.equal(requests[1].headers['X-CSRF-Token'], 'first')
  assert.equal(requests[3].headers['X-CSRF-Token'], 'renewed')
  assert.equal(requests[3].body, requests[1].body)
})

test('switching owners during renewal never applies the previous owner’s edit', async t => {
  const browserEvents = new EventTarget()
  const previous = globalThis.window
  globalThis.window = browserEvents
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous })
  let changed = false
  browserEvents.addEventListener('endquote:session-expired', () => { changed = true })
  const { api, requests } = await client(t, [session('owner-a', 'old'), rejected('CSRF', 403), session('owner-b', 'new')])
  await api('auth/session')
  await assert.rejects(api('owner/profile', 'PATCH', { name: 'Изменение' }), /Сеанс изменился/)
  assert.equal(changed, true)
  assert.equal(requests.filter(r => r.method === 'PATCH').length, 1)
})

test('a stale catalog revision is returned to the editor without replaying the save', async t => {
  const { api, requests } = await client(t, [rejected('CONFLICT', 409)])
  await assert.rejects(api('owner/catalog', 'PUT', { revision: 1 }), { status: 409, code: 'CONFLICT' })
  assert.equal(requests.length, 1)
})

test('legacy guest and owner sessions render with social login disabled', async t => {
  const owner = { id: 'owner-a', normalizedEmail: 'owner@example.test' }
  const { api } = await client(t, [
    { body: { owner: null, onboarded: false, csrf: 'guest' } },
    { body: { owner, onboarded: true, csrf: 'owner' } },
    { body: { owner, providers: ['google', 'apple'], mailReady: true } },
  ])
  assert.deepEqual((await api('auth/session')).providers, [])
  const signedIn = await api('auth/session')
  assert.deepEqual(signedIn.providers, [])
  assert.deepEqual(signedIn.owner, owner)
  assert.equal(signedIn.onboarded, true)
  assert.deepEqual((await api('auth/session')).providers, ['google', 'apple'])
})
