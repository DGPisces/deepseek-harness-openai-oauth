import { homedir } from 'node:os'
import { join } from 'node:path'

export function codexHome(): string {
  return process.env.DSH_CODEX_HOME ?? join(homedir(), '.deepseek-harness', 'codex')
}
