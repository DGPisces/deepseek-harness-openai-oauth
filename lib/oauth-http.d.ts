import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import type { AppServer } from './app-server.js';
export declare function handleOAuthRequest(server: Pick<AppServer, 'account' | 'models' | 'startChatGptLogin' | 'logout'>, req: IncomingMessage, res: ServerResponse): Promise<void>;
export declare function oauthRoute(server: AppServer): WebRoute;
