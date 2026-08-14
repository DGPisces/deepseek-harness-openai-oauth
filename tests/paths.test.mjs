import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { codexHome } from '../lib/paths.js'

test('Codex home defaults safely and resolves an explicit override', () => {
  const previous = process.env.DSH_CODEX_HOME
  try {
    delete process.env.DSH_CODEX_HOME
    assert.equal(codexHome(), join(homedir(), '.deepseek-harness', 'codex'))
    process.env.DSH_CODEX_HOME = '  '
    assert.equal(codexHome(), join(homedir(), '.deepseek-harness', 'codex'))
    process.env.DSH_CODEX_HOME = './custom-codex-home'
    assert.equal(codexHome(), resolve('custom-codex-home'))
  } finally {
    if (previous === undefined) delete process.env.DSH_CODEX_HOME
    else process.env.DSH_CODEX_HOME = previous
  }
})
