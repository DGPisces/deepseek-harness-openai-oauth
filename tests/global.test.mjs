import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

test('global installer targets standard and existing profiles', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-codex-global-'))
  const bin = join(root, 'bin')
  const log = join(root, 'npx.log')
  await mkdir(join(root, 'dsh', 'profiles', 'custom'), { recursive: true })
  await mkdir(bin)
  await writeFile(join(root, 'dsh', 'profiles', 'custom', 'package.json'), '{"dependencies":{}}')
  const npx = join(bin, 'npx')
  await writeFile(npx, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$FAKE_NPX_LOG"\n')
  await chmod(npx, 0o755)

  const result = spawnSync(process.execPath, ['lib/global.js', 'install'], {
    cwd: process.cwd(),
    env: { ...process.env, DSH_HOME: join(root, 'dsh'), FAKE_NPX_LOG: log, PATH: `${bin}:${process.env.PATH}` },
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  const calls = (await readFile(log, 'utf8')).trim().split('\n')
  assert.equal(calls.length, 3)
  assert(calls.some(line => line.includes(' --profile web add ')))
  assert(calls.some(line => line.includes(' --profile headless add ')))
  assert(calls.some(line => line.includes(' --profile custom add ')))
})

test('global uninstaller only targets profiles that contain the plugin', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-codex-uninstall-'))
  const bin = join(root, 'bin')
  const log = join(root, 'npx.log')
  await mkdir(join(root, 'dsh', 'profiles', 'with-plugin'), { recursive: true })
  await mkdir(join(root, 'dsh', 'profiles', 'without-plugin'), { recursive: true })
  await mkdir(bin)
  await writeFile(join(root, 'dsh', 'profiles', 'with-plugin', 'package.json'),
    '{"dependencies":{"dsh-llm-codex-app-server":"file:plugin"}}')
  await writeFile(join(root, 'dsh', 'profiles', 'without-plugin', 'package.json'), '{"dependencies":{}}')
  const npx = join(bin, 'npx')
  await writeFile(npx, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$FAKE_NPX_LOG"\n')
  await chmod(npx, 0o755)

  const result = spawnSync(process.execPath, ['lib/global.js', 'uninstall'], {
    cwd: process.cwd(),
    env: { ...process.env, DSH_HOME: join(root, 'dsh'), FAKE_NPX_LOG: log, PATH: `${bin}:${process.env.PATH}` },
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  const calls = (await readFile(log, 'utf8')).trim().split('\n')
  assert.equal(calls.length, 1)
  assert(calls[0].includes(' --profile with-plugin remove dsh-llm-codex-app-server'))
})
