#!/usr/bin/env node
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { dirname } from 'node:path'
import { codexHome } from './paths.js'

const require = createRequire(import.meta.url)
const codex = require.resolve('@openai/codex/bin/codex.js')
const home = codexHome()
await mkdir(home, { recursive: true, mode: 0o700 })

const child = spawn(process.execPath, [codex, 'login', ...process.argv.slice(2)], {
  env: { ...process.env, CODEX_HOME: home },
  stdio: 'inherit',
})
child.on('exit', code => process.exitCode = code ?? 1)
child.on('error', (error) => {
  console.error(`Failed to start Codex from ${dirname(codex)}:`, error.message)
  process.exitCode = 1
})
