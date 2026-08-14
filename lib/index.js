import { CallId, LlmAdapter, LlmError, ReasoningEffortId, } from '@deepseek-ai/dsh-llm';
import { AppServer } from './app-server.js';
import { oauthRoute } from './oauth-http.js';
export const name = 'llm-codex-app-server';
export const inject = ['llm'];
const PROVIDER = 'openai-codex';
const REPLAY_KIND = 'codex-app-server';
function textOf(blocks) {
    return blocks.map(block => block.type === 'text'
        ? block.text
        : block.type === 'tool-result' ? textOf(block.content) : '').join('');
}
function newUserText(options) {
    const lastAssistant = options.messages.findLastIndex(message => message.role === 'assistant');
    return options.messages.slice(lastAssistant + 1)
        .filter(message => message.role === 'user')
        .flatMap(message => message.content)
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n\n');
}
function toolResults(options) {
    const results = new Map();
    for (const message of options.messages) {
        for (const block of message.content) {
            if (block.type === 'tool-result')
                results.set(block.toolCallId, block);
        }
    }
    return results;
}
function toolSpec(options) {
    return (options.tools ?? []).map(tool => ({
        type: 'function',
        name: tool.name,
        description: tool.description,
        inputSchema: tool.parameters,
    }));
}
function sessionKey(options) {
    return String(options.sessionId ?? options.messages[0]?.id ?? 'one-shot');
}
function eventThreadItem(event) {
    const item = event.params.item;
    return item !== null && typeof item === 'object' ? item : undefined;
}
export class CodexAppServerAdapter extends LlmAdapter {
    server;
    sessions = new Map();
    modelsCache;
    constructor(server = new AppServer()) {
        super();
        this.server = server;
    }
    providerInfo() {
        return { id: PROVIDER, name: 'OpenAI Codex (ChatGPT OAuth)' };
    }
    async models() {
        if (this.modelsCache !== undefined)
            return this.modelsCache;
        const account = await this.server.account();
        if (account === null || account.type !== 'chatgpt') {
            throw new LlmError('Codex is not signed in. Run dsh-codex-login first.', 'MISSING_CREDENTIAL');
        }
        this.modelsCache = (await this.server.models()).filter(model => model.hidden !== true);
        return this.modelsCache;
    }
    async listModels() {
        return (await this.models()).map(model => ({
            provider: PROVIDER,
            id: String(model.model ?? model.id),
            name: String(model.displayName ?? model.model ?? model.id),
            description: typeof model.description === 'string' ? model.description : undefined,
            inputModalities: Array.isArray(model.inputModalities)
                ? model.inputModalities.filter(value => value === 'text' || value === 'image')
                : ['text'],
        }));
    }
    async resolveModel(provider, modelId) {
        const model = (await this.models()).find(entry => entry.model === modelId || entry.id === modelId);
        if (model === undefined)
            throw new LlmError(`Codex has no available model "${modelId}"`, 'UNKNOWN_MODEL');
        const efforts = Array.isArray(model.supportedReasoningEfforts)
            ? model.supportedReasoningEfforts.map((entry) => {
                const value = entry;
                const id = String(value.reasoningEffort);
                return { id: ReasoningEffortId(id), name: id, description: String(value.description ?? '') };
            })
            : [];
        return {
            provider,
            id: modelId,
            name: String(model.displayName ?? modelId),
            description: typeof model.description === 'string' ? model.description : undefined,
            inputModalities: Array.isArray(model.inputModalities)
                ? model.inputModalities.filter(value => value === 'text' || value === 'image')
                : ['text'],
            ...efforts.length === 0 ? {} : {
                reasoning: {
                    efforts,
                    defaultEffort: ReasoningEffortId(String(model.defaultReasoningEffort)),
                },
            },
        };
    }
    async createSession(options) {
        const tools = JSON.stringify(toolSpec(options));
        const system = [
            options.system ?? '',
            'You are the model inside DeepSeek Harness. Use only the supplied dynamic tools.',
            'Never call built-in Codex tools. Call at most one dynamic tool at a time.',
        ].filter(Boolean).join('\n\n');
        const threadId = await this.server.startThread({
            model: options.model,
            cwd: process.cwd(),
            approvalPolicy: 'never',
            sandbox: 'read-only',
            ephemeral: false,
            baseInstructions: system,
            dynamicTools: toolSpec(options),
        });
        return { threadId, tools, pending: [], backlog: [] };
    }
    async session(options) {
        const key = sessionKey(options);
        let session = this.sessions.get(key);
        if (session === undefined) {
            session = await this.createSession(options);
            this.sessions.set(key, session);
        }
        if (session.tools !== JSON.stringify(toolSpec(options))) {
            throw new LlmError('Codex tool schemas changed during an active Harness session', 'UNSUPPORTED_OPTION');
        }
        return session;
    }
    async resumeTools(session, options) {
        const results = toolResults(options);
        for (const call of session.pending) {
            const result = results.get(call.callId);
            if (result === undefined)
                throw new LlmError(`Missing Harness result for Codex tool call "${call.callId}"`, 'INVALID_REQUEST');
            this.server.respond(call.requestId, {
                contentItems: [{ type: 'inputText', text: textOf(result.content) || '(no output)' }],
                success: result.isError !== true,
            });
        }
        session.pending = [];
    }
    async nextEvent(session, signal) {
        return session.backlog.shift() ?? this.server.nextEvent(session.threadId, signal);
    }
    async collectToolCalls(session, first, signal) {
        const calls = [];
        const add = (event) => {
            const { callId, tool, arguments: args } = event.params;
            if (event.requestId === undefined || typeof callId !== 'string' || typeof tool !== 'string') {
                throw new LlmError('Malformed Codex dynamic tool request', 'PROTOCOL_ERROR');
            }
            calls.push({ requestId: event.requestId, callId, name: tool, arguments: args });
        };
        add(first);
        // ponytail: app-server has no batch-end event for parallel dynamic calls;
        // collect the synchronously emitted JSON-RPC burst, then fail closed if a
        // later call appears after Harness has started executing this batch.
        while (true) {
            const settle = AbortSignal.timeout(25);
            const combined = signal === undefined ? settle : AbortSignal.any([signal, settle]);
            try {
                const event = await this.server.nextEvent(session.threadId, combined);
                if (event.method === 'item/tool/call')
                    add(event);
                else
                    session.backlog.push(event);
            }
            catch (error) {
                if (signal?.aborted)
                    throw error;
                break;
            }
        }
        return calls;
    }
    async *stream(options) {
        if (options.stop !== undefined || options.temperature !== undefined || options.maxTokens !== undefined) {
            throw new LlmError('Codex app-server does not expose stop, temperature, or maxTokens per turn', 'UNSUPPORTED_OPTION');
        }
        if (options.messages.some(message => message.content.some(block => block.type === 'image'))) {
            throw new LlmError('Codex app-server image bridging is not implemented', 'UNSUPPORTED_CONTENT');
        }
        const session = await this.session(options);
        if (session.pending.length > 0) {
            await this.resumeTools(session, options);
        }
        else {
            session.turnId = await this.server.startTurn(session.threadId, {
                model: options.model,
                ...options.reasoningEffort === undefined ? {} : { effort: String(options.reasoningEffort) },
                input: [{ type: 'text', text: newUserText(options) }],
            });
        }
        let nextIndex = 0;
        const open = new Map();
        try {
            while (true) {
                const event = await this.nextEvent(session, options.signal);
                if (event.method === 'turn/started') {
                    const turn = event.params.turn;
                    if (typeof turn.id === 'string')
                        session.turnId = turn.id;
                    continue;
                }
                if (event.method === 'item/agentMessage/delta' || event.method === 'item/reasoning/summaryTextDelta') {
                    const id = String(event.params.itemId);
                    const type = event.method === 'item/agentMessage/delta' ? 'text' : 'reasoning';
                    let block = open.get(id);
                    if (block === undefined) {
                        block = { index: nextIndex++, type, text: '' };
                        open.set(id, block);
                        yield { type: 'block-start', index: block.index, blockType: type };
                    }
                    const delta = String(event.params.delta ?? '');
                    block.text += delta;
                    yield type === 'text'
                        ? { type: 'text-delta', index: block.index, text: delta }
                        : { type: 'reasoning-delta', index: block.index, text: delta };
                    continue;
                }
                if (event.method === 'item/completed') {
                    const item = eventThreadItem(event);
                    const id = typeof item?.id === 'string' ? item.id : '';
                    const block = open.get(id);
                    if (block !== undefined) {
                        open.delete(id);
                        yield {
                            type: 'block-end',
                            index: block.index,
                            block: block.type === 'text'
                                ? { type: 'text', text: block.text }
                                : { type: 'reasoning', text: block.text },
                        };
                    }
                    continue;
                }
                if (event.method === 'item/tool/call') {
                    const calls = await this.collectToolCalls(session, event, options.signal);
                    session.pending = calls;
                    for (const call of calls) {
                        const index = nextIndex++;
                        const args = JSON.stringify(call.arguments ?? {});
                        const id = CallId(call.callId);
                        yield { type: 'block-start', index, blockType: 'tool-call' };
                        yield { type: 'tool-call-delta', index, id, name: call.name, argumentsDelta: args };
                        yield {
                            type: 'block-end', index,
                            block: { type: 'tool-call', id, name: call.name, arguments: args },
                        };
                    }
                    yield {
                        type: 'finish',
                        reason: { kind: 'tool-calls' },
                        replayState: { kind: REPLAY_KIND, version: 1, threadId: session.threadId },
                    };
                    return;
                }
                if (event.method === 'error') {
                    const detail = event.params.error;
                    throw new LlmError(String(detail?.message ?? 'Codex turn failed'), 'CODEX_ERROR');
                }
                if (event.method === 'turn/completed') {
                    const turn = event.params.turn;
                    if (turn.status === 'failed') {
                        const error = turn.error;
                        throw new LlmError(String(error?.message ?? 'Codex turn failed'), 'CODEX_ERROR');
                    }
                    yield {
                        type: 'finish',
                        reason: turn.status === 'interrupted'
                            ? { kind: 'aborted', failure: { message: 'Codex turn interrupted', code: 'ABORTED' } }
                            : { kind: 'stop' },
                        replayState: { kind: REPLAY_KIND, version: 1, threadId: session.threadId },
                    };
                    return;
                }
            }
        }
        catch (error) {
            if (options.signal?.aborted && session.turnId !== undefined) {
                await this.server.interrupt(session.threadId, session.turnId).catch(() => { });
            }
            throw error;
        }
    }
}
export function apply(ctx) {
    const server = new AppServer();
    ctx.llm.registerAdapter([PROVIDER], new CodexAppServerAdapter(server));
    ctx.effect(() => () => server.close(), 'llm-codex-app-server.close');
    ctx.inject(['webServer'], (webCtx) => {
        webCtx.effect(() => webCtx.webServer.register(oauthRoute(server)), 'llm-codex-app-server.oauth-route');
    });
}
export default { name, inject, apply };
