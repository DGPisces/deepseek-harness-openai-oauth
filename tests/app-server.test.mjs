import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

test('starts Codex from its isolated home without loading Harness project config', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'dsh-codex-workspace-'))
  const codexHome = join(workspace, '.deepseek-harness', 'codex')
  await mkdir(join(workspace, '.codex'), { recursive: true })
  await writeFile(join(workspace, '.codex', 'config.toml'), 'model = "gpt-5.6-sol"\n')

  try {
    const appServer = resolve('lib/app-server.js')
    const script = `
      const { AppServer } = await import(${JSON.stringify(appServer)});
      const server = new AppServer();
      await server.start();
      server.close();
    `
    const { stderr } = await execFileAsync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: workspace,
      env: { ...process.env, DSH_CODEX_HOME: codexHome },
      timeout: 15_000,
    })

    assert.doesNotMatch(stderr, /Project-local config, hooks, and exec policies are disabled/)
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})
