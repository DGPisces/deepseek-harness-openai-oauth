import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
export function codexHome() {
    const configured = process.env.DSH_CODEX_HOME?.trim();
    return configured ? resolve(configured) : join(homedir(), '.deepseek-harness', 'codex');
}
