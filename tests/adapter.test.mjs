import assert from 'node:assert/strict'
import test from 'node:test'
import { CodexAppServerAdapter } from '../lib/index.js'

class FakeServer {
  events = []
  responses = []
  turnInput = ''

  async account() { return { type: 'chatgpt' } }
  async models() {
    return [{
      id: 'gpt-5.6-sol', model: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol', hidden: false,
      inputModalities: ['text', 'image'], defaultReasoningEffort: 'high',
      supportedReasoningEfforts: [{ reasoningEffort: 'high', description: 'High' }],
    }]
  }
  async startThread() { return 'thread-1' }
  async startTurn(_threadId, input) {
    this.turnInput = input.input[0].text
    this.events.push({
      method: 'item/tool/call', requestId: 7,
      params: { threadId: 'thread-1', callId: 'call-1', tool: 'echo', arguments: { text: 'ping' } },
    })
    return 'turn-1'
  }
  nextEvent(_threadId, signal) {
    const event = this.events.shift()
    if (event) return Promise.resolve(event)
    return new Promise((_resolve, reject) => {
      const timer = setTimeout(() => {}, 100)
      const abort = () => {
        clearTimeout(timer)
        reject(signal.reason)
      }
      if (signal?.aborted) abort()
      else signal?.addEventListener('abort', abort, { once: true })
    })
  }
  respond(id, result) {
    this.responses.push({ id, result })
    this.events.push(
      { method: 'item/agentMessage/delta', params: { threadId: 'thread-1', itemId: 'answer', delta: 'pong' } },
      { method: 'item/completed', params: { threadId: 'thread-1', item: { id: 'answer', type: 'agentMessage' } } },
      { method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } } },
    )
  }
}

const base = {
  provider: 'openai-codex', model: 'gpt-5.6-sol', sessionId: 'session-1',
  tools: [{ name: 'echo', description: 'echo', parameters: { type: 'object' } }],
}

test('bridges a Codex dynamic tool call across two Harness model steps', async () => {
  const server = new FakeServer()
  const adapter = new CodexAppServerAdapter(server)
  const first = await Array.fromAsync(adapter.stream({
    ...base,
    messages: [
      { id: 'u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'ping' }] },
      { id: 'u2', role: 'user', source: { kind: 'plugin', plugin: 'context' }, content: [{ type: 'text', text: 'runtime context' }] },
    ],
  }))
  assert.equal(server.turnInput, 'ping\n\nruntime context')
  assert.deepEqual(first.at(-1).reason, { kind: 'tool-calls' })
  assert.equal(first.find(chunk => chunk.type === 'block-end').block.id, 'call-1')

  const second = await Array.fromAsync(adapter.stream({
    ...base,
    messages: [
      { id: 'u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'ping' }] },
      { id: 'a1', role: 'assistant', source: { kind: 'model', provider: 'openai-codex', model: 'gpt-5.6-sol' }, content: [{ type: 'tool-call', id: 'call-1', name: 'echo', arguments: '{"text":"ping"}' }] },
      { id: 't1', role: 'user', source: { kind: 'tool', callId: 'call-1' }, content: [{ type: 'tool-result', toolCallId: 'call-1', content: [{ type: 'text', text: 'pong-from-harness' }], isError: false }] },
    ],
  }))
  assert.equal(server.responses[0].result.contentItems[0].text, 'pong-from-harness')
  assert.equal(second.find(chunk => chunk.type === 'block-end').block.text, 'pong')
  assert.deepEqual(second.at(-1).reason, { kind: 'stop' })
})

test('discovers models from Codex instead of hardcoding GPT versions', async () => {
  const adapter = new CodexAppServerAdapter(new FakeServer())
  const models = await adapter.listModels('openai-codex')
  assert.equal(models[0].id, 'gpt-5.6-sol')
})

test('interrupts the Codex turn when Harness cancels', async () => {
  const server = new FakeServer()
  let interrupted = false
  server.startTurn = async () => 'turn-1'
  server.interrupt = async () => { interrupted = true }
  const controller = new AbortController()
  const result = Array.fromAsync(new CodexAppServerAdapter(server).stream({
    ...base,
    signal: controller.signal,
    messages: [{ id: 'u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'wait' }] }],
  }))
  controller.abort()
  await assert.rejects(result)
  assert.equal(interrupted, true)
})
