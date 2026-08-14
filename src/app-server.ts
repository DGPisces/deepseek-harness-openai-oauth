import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createInterface } from 'node:readline'
import { codexHome } from './paths.js'

type JsonObject = Record<string, unknown>
export type ServerEvent = { method: string; params: JsonObject; requestId?: string | number }

class EventQueue {
  private values: ServerEvent[] = []
  private waiters: Array<{ resolve: (value: ServerEvent) => void; reject: (error: Error) => void }> = []

  push(value: ServerEvent): void {
    const waiter = this.waiters.shift()
    waiter === undefined ? this.values.push(value) : waiter.resolve(value)
  }

  fail(error: Error): void {
    for (const waiter of this.waiters) waiter.reject(error)
    this.waiters = []
  }

  take(signal?: AbortSignal): Promise<ServerEvent> {
    const value = this.values.shift()
    if (value !== undefined) return Promise.resolve(value)
    return new Promise((resolve, reject) => {
      const abort = (): void => {
        this.waiters = this.waiters.filter(waiter => waiter.resolve !== done)
        reject(signal?.reason ?? new Error('aborted'))
      }
      const done = (event: ServerEvent): void => {
        signal?.removeEventListener('abort', abort)
        resolve(event)
      }
      if (signal?.aborted) return abort()
      signal?.addEventListener('abort', abort, { once: true })
      this.waiters.push({ resolve: done, reject })
    })
  }
}

interface PendingRequest {
  resolve: (value: JsonObject) => void
  reject: (error: Error) => void
}

export class AppServer {
  private child?: ChildProcessWithoutNullStreams
  private nextId = 1
  private readonly pending = new Map<number, PendingRequest>()
  private readonly queues = new Map<string, EventQueue>()
  private readonly turnThreads = new Map<string, string>()
  private starting?: Promise<void>

  async start(): Promise<void> {
    if (this.starting !== undefined) return this.starting
    this.starting = this.startInner()
    return this.starting
  }

  private async startInner(): Promise<void> {
    const home = codexHome()
    await mkdir(home, { recursive: true, mode: 0o700 })
    const require = createRequire(import.meta.url)
    const codex = require.resolve('@openai/codex/bin/codex.js')
    this.child = spawn(process.execPath, [
      codex,
      '-c', 'features.shell_tool=false',
      '-c', 'features.goals=false',
      '-c', 'features.apps=false',
      '-c', 'features.browser_use=false',
      '-c', 'features.computer_use=false',
      '-c', 'features.hooks=false',
      '-c', 'features.image_generation=false',
      '-c', 'features.in_app_browser=false',
      '-c', 'features.multi_agent=false',
      '-c', 'features.plugins=false',
      '-c', 'features.skill_search=false',
      '-c', 'features.tool_suggest=false',
      '-c', 'features.unified_exec=false',
      '-c', 'features.workspace_dependencies=false',
      '-c', 'web_search="disabled"',
      '-c', 'agents.enabled=false',
      '-c', 'tools.view_image=false',
      '-c', 'project_doc_max_bytes=0',
      'app-server', '--stdio',
    ], {
      env: { ...process.env, CODEX_HOME: home },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    createInterface({ input: this.child.stdout }).on('line', line => this.receive(JSON.parse(line) as JsonObject))
    this.child.stderr.on('data', chunk => process.stderr.write(chunk))
    this.child.on('exit', (code) => {
      const error = new Error(`Codex app-server exited with code ${String(code)}`)
      for (const request of this.pending.values()) request.reject(error)
      for (const queue of this.queues.values()) queue.fail(error)
      this.pending.clear()
      this.child = undefined
      this.starting = undefined
    })
    await this.request('initialize', {
      clientInfo: { name: 'deepseek_harness', title: 'DeepSeek Harness', version: '0.1.0' },
      capabilities: { experimentalApi: true },
    })
    this.send({ method: 'initialized', params: {} })
  }

  private send(message: JsonObject): void {
    if (this.child === undefined) throw new Error('Codex app-server is not running')
    this.child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  private receive(message: JsonObject): void {
    const id = message.id
    if (typeof id === 'number' && (message.result !== undefined || message.error !== undefined)) {
      const request = this.pending.get(id)
      if (request === undefined) return
      this.pending.delete(id)
      if (message.error !== undefined) request.reject(new Error(JSON.stringify(message.error)))
      else request.resolve(message.result as JsonObject)
      return
    }

    const method = message.method
    const params = message.params as JsonObject | undefined
    if (typeof method !== 'string' || params === undefined) return
    const threadId = typeof params.threadId === 'string'
      ? params.threadId
      : this.threadIdFromTurn(params.turn)
    if (threadId === undefined) return

    if (id !== undefined) {
      if (method !== 'item/tool/call') {
        this.send({ id, error: { code: -32601, message: `Unsupported app-server request: ${method}` } })
      }
      this.queue(threadId).push({ method, params, requestId: id as string | number })
      return
    }
    this.queue(threadId).push({ method, params })
  }

  private threadIdFromTurn(turn: unknown): string | undefined {
    if (turn === null || typeof turn !== 'object') return undefined
    const turnId = (turn as JsonObject).id
    return typeof turnId === 'string' ? this.turnThreads.get(turnId) : undefined
  }

  private queue(threadId: string): EventQueue {
    let queue = this.queues.get(threadId)
    if (queue === undefined) {
      queue = new EventQueue()
      this.queues.set(threadId, queue)
    }
    return queue
  }

  async request(method: string, params: JsonObject): Promise<JsonObject> {
    if (method !== 'initialize') await this.start()
    const id = this.nextId++
    this.send({ id, method, params })
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }

  async account(refreshToken = true): Promise<JsonObject | null> {
    const result = await this.request('account/read', { refreshToken })
    return result.account as JsonObject | null
  }

  async startChatGptLogin(): Promise<JsonObject> {
    return this.request('account/login/start', {
      type: 'chatgpt',
      useHostedLoginSuccessPage: true,
      appBrand: 'chatgpt',
    })
  }

  async logout(): Promise<void> {
    await this.request('account/logout', {})
  }

  async models(): Promise<JsonObject[]> {
    const result = await this.request('model/list', {})
    return result.data as JsonObject[]
  }

  async startThread(input: JsonObject): Promise<string> {
    const result = await this.request('thread/start', input)
    const thread = result.thread as JsonObject
    const id = thread.id
    if (typeof id !== 'string') throw new Error('Codex thread/start returned no thread id')
    this.queue(id)
    return id
  }

  async startTurn(threadId: string, input: JsonObject): Promise<string> {
    const result = await this.request('turn/start', { threadId, ...input })
    const turn = result.turn as JsonObject
    if (typeof turn.id !== 'string') throw new Error('Codex turn/start returned no turn id')
    this.turnThreads.set(turn.id, threadId)
    return turn.id
  }

  nextEvent(threadId: string, signal?: AbortSignal): Promise<ServerEvent> {
    return this.queue(threadId).take(signal)
  }

  respond(id: string | number, result: JsonObject): void {
    this.send({ id, result })
  }

  async interrupt(threadId: string, turnId: string): Promise<void> {
    await this.request('turn/interrupt', { threadId, turnId })
  }

  close(): void {
    this.child?.kill()
  }
}
