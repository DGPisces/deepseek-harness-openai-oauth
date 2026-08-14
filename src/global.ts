#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync, rmdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, parse, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { codexHome } from './paths.js'

const PACKAGE = 'dsh-llm-codex-app-server'
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const packageSpec = `file:${packageRoot}`

function dshHome(): string {
  return process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
}

function manifest(profile: string): Record<string, unknown> | undefined {
  const path = join(dshHome(), 'profiles', profile, 'package.json')
  if (!existsSync(path)) return undefined
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

function existingProfiles(): string[] {
  const root = join(dshHome(), 'profiles')
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && manifest(entry.name) !== undefined)
    .map(entry => entry.name)
}

function installed(profile: string): boolean {
  const dependencies = manifest(profile)?.dependencies
  return typeof dependencies === 'object' && dependencies !== null && PACKAGE in dependencies
}

function runDsh(profile: string, command: 'add' | 'remove', target: string): boolean {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const result = spawnSync(executable, [
    '--yes', '@deepseek-ai/dsh', 'plugin', '--profile', profile, command, target,
  ], { stdio: 'inherit' })
  if (result.error !== undefined) {
    console.error(result.error.message)
    return false
  }
  return result.status === 0
}

function profilesForInstall(): string[] {
  return [...new Set(['web', 'headless', ...existingProfiles()])]
}

function purgeAuth(): boolean {
  const home = resolve(codexHome())
  if (new Set([parse(home).root, resolve(homedir()), resolve(dshHome()), resolve(process.cwd())]).has(home)) {
    console.error(`Refusing to purge unsafe OAuth path: ${home}`)
    return false
  }
  if (!existsSync(home)) return true
  const require = createRequire(import.meta.url)
  const codex = require.resolve('@openai/codex/bin/codex.js')
  const logout = spawnSync(process.execPath, [codex, 'logout'], {
    env: { ...process.env, CODEX_HOME: home },
    stdio: 'inherit',
  })
  if (logout.error !== undefined || logout.status !== 0) {
    console.error('Codex logout failed; OAuth data was kept.')
    return false
  }
  rmSync(home, { recursive: true, force: true })
  if (!process.env.DSH_CODEX_HOME?.trim()) {
    try { rmdirSync(dirname(home)) } catch {}
  }
  console.log(`Removed OAuth data from ${home}`)
  return true
}

function usage(): never {
  console.error('Usage: dsh-codex <install|uninstall> [--purge-auth]')
  process.exit(2)
}

const [command, ...flags] = process.argv.slice(2)
if (command === 'install') {
  if (flags.length > 0) usage()
  let ok = true
  for (const profile of profilesForInstall()) ok = runDsh(profile, 'add', packageSpec) && ok
  if (ok) console.log(`Installed ${PACKAGE} for all current Harness profiles.`)
  else process.exitCode = 1
} else if (command === 'uninstall') {
  if (flags.some(flag => flag !== '--purge-auth') || flags.length > 1) usage()
  let ok = true
  for (const profile of existingProfiles().filter(installed)) {
    ok = runDsh(profile, 'remove', PACKAGE) && ok
  }
  if (flags.includes('--purge-auth')) ok = purgeAuth() && ok
  if (ok) console.log(`Removed ${PACKAGE} from all current Harness profiles.`)
  else process.exitCode = 1
} else {
  usage()
}
