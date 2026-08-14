import type { Context } from '@deepseek-ai/cordis';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, LlmModelInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm';
import { AppServer } from './app-server.js';
export declare const name = "llm-codex-app-server";
export declare const inject: string[];
export declare class CodexAppServerAdapter extends LlmAdapter {
    private readonly server;
    private readonly sessions;
    private modelsCache?;
    constructor(server?: AppServer);
    providerInfo(): {
        id: string;
        name: string;
    };
    private models;
    listModels(): Promise<readonly LlmModelInfo[]>;
    resolveModel(provider: string, modelId: string): Promise<LlmResolvedModelInfo>;
    private createSession;
    private session;
    private resumeTools;
    private nextEvent;
    private collectToolCalls;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
export declare function apply(ctx: Context): void;
declare const _default: {
    name: string;
    inject: string[];
    apply: typeof apply;
};
export default _default;
