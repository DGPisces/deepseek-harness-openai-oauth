type JsonObject = Record<string, unknown>;
export type ServerEvent = {
    method: string;
    params: JsonObject;
    requestId?: string | number;
};
export declare class AppServer {
    private child?;
    private nextId;
    private readonly pending;
    private readonly queues;
    private readonly turnThreads;
    private starting?;
    start(): Promise<void>;
    private startInner;
    private send;
    private receive;
    private threadIdFromTurn;
    private queue;
    request(method: string, params: JsonObject): Promise<JsonObject>;
    account(refreshToken?: boolean): Promise<JsonObject | null>;
    startChatGptLogin(): Promise<JsonObject>;
    logout(): Promise<void>;
    models(): Promise<JsonObject[]>;
    startThread(input: JsonObject): Promise<string>;
    startTurn(threadId: string, input: JsonObject): Promise<string>;
    nextEvent(threadId: string, signal?: AbortSignal): Promise<ServerEvent>;
    respond(id: string | number, result: JsonObject): void;
    interrupt(threadId: string, turnId: string): Promise<void>;
    close(): void;
}
export {};
