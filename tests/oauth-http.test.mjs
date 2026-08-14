import assert from 'node:assert/strict'
import test from 'node:test'
import { handleOAuthRequest } from '../lib/oauth-http.js'

function response() {
  return {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers },
    end(body = '') { this.body = body },
  }
}

const localHeaders = {
  host: '127.0.0.1:1456',
  origin: 'http://127.0.0.1:1456',
  'sec-fetch-site': 'same-origin',
}
const localSocket = { remoteAddress: '127.0.0.1' }

test('serves local OAuth status and rejects cross-site control', async () => {
  let reads = 0
  const server = {
    async account() { reads++; return { type: 'chatgpt', email: 'user@example.com', planType: 'pro' } },
    async models() { return [{ model: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol' }] },
    async startChatGptLogin() { return { authUrl: 'https://chatgpt.com/login', loginId: 'login-1' } },
    async logout() {},
  }
  const ok = response()
  await handleOAuthRequest(server, { method: 'GET', url: '/api/codex-oauth', headers: localHeaders, socket: localSocket }, ok)
  assert.equal(ok.status, 200)
  assert.deepEqual(JSON.parse(ok.body), {
    authenticated: true,
    email: 'user@example.com',
    planType: 'pro',
    models: [{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }],
  })

  const blocked = response()
  await handleOAuthRequest(server, {
    method: 'POST', url: '/api/codex-oauth/logout',
    headers: { ...localHeaders, origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' },
    socket: localSocket,
  }, blocked)
  assert.equal(blocked.status, 403)

  const remote = response()
  await handleOAuthRequest(server, {
    method: 'GET', url: '/api/codex-oauth', headers: localHeaders,
    socket: { remoteAddress: '192.0.2.1' },
  }, remote)
  assert.equal(remote.status, 403)
  assert.equal(reads, 1)
})

test('starts browser login and signs out through same-origin POST requests', async () => {
  let loggedOut = false
  const server = {
    async account() { return null },
    async models() { return [] },
    async startChatGptLogin() { return { authUrl: 'https://chatgpt.com/login', loginId: 'login-1' } },
    async logout() { loggedOut = true },
  }
  const login = response()
  await handleOAuthRequest(server, { method: 'POST', url: '/api/codex-oauth/login', headers: localHeaders, socket: localSocket }, login)
  assert.deepEqual(JSON.parse(login.body), { authUrl: 'https://chatgpt.com/login', loginId: 'login-1' })

  const logout = response()
  await handleOAuthRequest(server, { method: 'POST', url: '/api/codex-oauth/logout', headers: localHeaders, socket: localSocket }, logout)
  assert.equal(logout.status, 200)
  assert.equal(loggedOut, true)
})
