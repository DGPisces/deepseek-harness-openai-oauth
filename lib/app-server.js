import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { codexHome } from './paths.js';
class EventQueue {
    values = [];
    waiters = [];
    push(value) {
        const waiter = this.waiters.shift();
        waiter === undefined ? this.values.push(value) : waiter.resolve(value);
    }
    fail(error) {
        for (const waiter of this.waiters)
            waiter.reject(error);
        this.waiters = [];
    }
    take(signal) {
        const value = this.values.shift();
        if (value !== undefined)
            return Promise.resolve(value);
        return new Promise((resolve, reject) => {
            const abort = () => {
                this.waiters = this.waiters.filter(waiter => waiter.resolve !== done);
                reject(signal?.reason ?? new Error('aborted'));
            };
            const done = (event) => {
                signal?.removeEventListener('abort', abort);
                resolve(event);
            };
            if (signal?.aborted)
                return abort();
            signal?.addEventListener('abort', abort, { once: true });
            this.waiters.push({ resolve: done, reject });
        });
    }
}
export class AppServer {
    child;
    nextId = 1;
    pending = new Map();
    queues = new Map();
    turnThreads = new Map();
    starting;
    async start() {
        if (this.starting !== undefined)
            return this.starting;
        this.starting = this.startInner();
        return this.starting;
    }
    async startInner() {
        const home = codexHome();
        await mkdir(home, { recursive: true, mode: 0o700 });
        const require = createRequire(import.meta.url);
        const codex = require.resolve('@openai/codex/bin/codex.js');
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
            cwd: home,
            env: { ...process.env, CODEX_HOME: home },
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        createInterface({ input: this.child.stdout }).on('line', line => this.receive(JSON.parse(line)));
        this.child.stderr.on('data', chunk => process.stderr.write(chunk));
        this.child.on('exit', (code) => {
            const error = new Error(`Codex app-server exited with code ${String(code)}`);
            for (const request of this.pending.values())
                request.reject(error);
            for (const queue of this.queues.values())
                queue.fail(error);
            this.pending.clear();
            this.child = undefined;
            this.starting = undefined;
        });
        await this.request('initialize', {
            clientInfo: { name: 'deepseek_harness', title: 'DeepSeek Harness', version: '0.1.0' },
            capabilities: { experimentalApi: true },
        });
        this.send({ method: 'initialized', params: {} });
    }
    send(message) {
        if (this.child === undefined)
            throw new Error('Codex app-server is not running');
        this.child.stdin.write(`${JSON.stringify(message)}\n`);
    }
    receive(message) {
        const id = message.id;
        if (typeof id === 'number' && (message.result !== undefined || message.error !== undefined)) {
            const request = this.pending.get(id);
            if (request === undefined)
                return;
            this.pending.delete(id);
            if (message.error !== undefined)
                request.reject(new Error(JSON.stringify(message.error)));
            else
                request.resolve(message.result);
            return;
        }
        const method = message.method;
        const params = message.params;
        if (typeof method !== 'string' || params === undefined)
            return;
        const threadId = typeof params.threadId === 'string'
            ? params.threadId
            : this.threadIdFromTurn(params.turn);
        if (threadId === undefined)
            return;
        if (id !== undefined) {
            if (method !== 'item/tool/call') {
                this.send({ id, error: { code: -32601, message: `Unsupported app-server request: ${method}` } });
            }
            this.queue(threadId).push({ method, params, requestId: id });
            return;
        }
        this.queue(threadId).push({ method, params });
    }
    threadIdFromTurn(turn) {
        if (turn === null || typeof turn !== 'object')
            return undefined;
        const turnId = turn.id;
        return typeof turnId === 'string' ? this.turnThreads.get(turnId) : undefined;
    }
    queue(threadId) {
        let queue = this.queues.get(threadId);
        if (queue === undefined) {
            queue = new EventQueue();
            this.queues.set(threadId, queue);
        }
        return queue;
    }
    async request(method, params) {
        if (method !== 'initialize')
            await this.start();
        const id = this.nextId++;
        this.send({ id, method, params });
        return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    }
    async account(refreshToken = true) {
        const result = await this.request('account/read', { refreshToken });
        return result.account;
    }
    async startChatGptLogin() {
        return this.request('account/login/start', {
            type: 'chatgpt',
            useHostedLoginSuccessPage: true,
            appBrand: 'chatgpt',
        });
    }
    async logout() {
        await this.request('account/logout', {});
    }
    async models() {
        const result = await this.request('model/list', {});
        return result.data;
    }
    async startThread(input) {
        const result = await this.request('thread/start', input);
        const thread = result.thread;
        const id = thread.id;
        if (typeof id !== 'string')
            throw new Error('Codex thread/start returned no thread id');
        this.queue(id);
        return id;
    }
    async startTurn(threadId, input) {
        const result = await this.request('turn/start', { threadId, ...input });
        const turn = result.turn;
        if (typeof turn.id !== 'string')
            throw new Error('Codex turn/start returned no turn id');
        this.turnThreads.set(turn.id, threadId);
        return turn.id;
    }
    nextEvent(threadId, signal) {
        return this.queue(threadId).take(signal);
    }
    respond(id, result) {
        this.send({ id, result });
    }
    async interrupt(threadId, turnId) {
        await this.request('turn/interrupt', { threadId, turnId });
    }
    close() {
        this.child?.kill();
    }
}
