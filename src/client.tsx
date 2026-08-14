import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { SettingsSectionOwnerProps } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'

const ENDPOINT = '/api/codex-oauth'

interface Model {
  id: string
  name: string
}

interface Status {
  authenticated: boolean
  email?: string | null
  planType?: string | null
  models: Model[]
}

const zh = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')
const copy = zh ? {
  title: 'OpenAI OAuth',
  intro: '使用 ChatGPT 账户连接 GPT 模型。登录和 token 刷新完全由本机 Codex app-server 管理。',
  connected: '已连接',
  disconnected: '尚未连接',
  login: '使用 ChatGPT 登录',
  waiting: '等待浏览器授权…',
  logout: '退出登录',
  refresh: '刷新状态',
  models: '可用模型',
  noModels: '登录后将显示账户可用的模型。',
  popup: '如果登录页没有自动打开，请点击这里继续。',
} : {
  title: 'OpenAI OAuth',
  intro: 'Connect GPT models with your ChatGPT account. The local Codex app-server owns login and token refresh.',
  connected: 'Connected',
  disconnected: 'Not connected',
  login: 'Sign in with ChatGPT',
  waiting: 'Waiting for browser authorization…',
  logout: 'Sign out',
  refresh: 'Refresh status',
  models: 'Available models',
  noModels: 'Models available to your account appear after sign-in.',
  popup: 'If the sign-in page did not open, continue here.',
}

async function request<T>(path = '', method = 'GET'): Promise<T> {
  const response = await fetch(`${ENDPOINT}${path}`, {
    method,
    headers: { accept: 'application/json' },
    credentials: 'same-origin',
  })
  const body = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(body.error ?? `HTTP ${String(response.status)}`)
  return body
}

const styles: Record<string, CSSProperties> = {
  section: { maxWidth: 720, padding: '4px 0 32px' },
  title: { fontSize: 20, margin: '0 0 8px' },
  intro: { color: 'var(--text-secondary, #666)', lineHeight: 1.6, margin: '0 0 20px' },
  card: { border: '1px solid var(--border-color, #ddd)', borderRadius: 12, padding: 20 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  status: { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 },
  dot: { width: 9, height: 9, borderRadius: '50%' },
  meta: { color: 'var(--text-secondary, #666)', fontSize: 13, marginTop: 6 },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  button: { border: '1px solid var(--border-color, #bbb)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', background: 'var(--surface-color, #fff)', color: 'inherit' },
  primary: { background: 'var(--primary-color, #2563eb)', borderColor: 'transparent', color: '#fff' },
  error: { color: '#b42318', marginTop: 12 },
  models: { marginTop: 24 },
  list: { margin: '10px 0 0', paddingLeft: 20, lineHeight: 1.8 },
}

export function OpenAiOAuthSection(_props: SettingsSectionOwnerProps): ReactNode {
  const [status, setStatus] = useState<Status | undefined>()
  const [busy, setBusy] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [authUrl, setAuthUrl] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()

  const refresh = useCallback(async (): Promise<Status | undefined> => {
    try {
      const next = await request<Status>()
      setStatus(next)
      setError(undefined)
      if (next.authenticated) {
        setWaiting(false)
        setAuthUrl(undefined)
      }
      return next
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      return undefined
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (!waiting) return
    const timer = window.setInterval(() => { void refresh() }, 1200)
    return () => { window.clearInterval(timer) }
  }, [refresh, waiting])

  const login = async (): Promise<void> => {
    const popup = window.open('about:blank', '_blank')
    if (popup !== null) popup.opener = null
    setBusy(true)
    setError(undefined)
    try {
      const result = await request<{ authUrl?: string }>('/login', 'POST')
      if (typeof result.authUrl !== 'string') throw new Error('Codex did not return an authentication URL.')
      setAuthUrl(result.authUrl)
      setWaiting(true)
      if (popup !== null) popup.location.href = result.authUrl
    } catch (reason) {
      popup?.close()
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const logout = async (): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      await request('/logout', 'POST')
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const connected = status?.authenticated === true
  return (
    <section style={styles.section}>
      <h2 style={styles.title}>{copy.title}</h2>
      <p style={styles.intro}>{copy.intro}</p>
      <div style={styles.card}>
        <div style={styles.row}>
          <div>
            <div style={styles.status} role="status" aria-live="polite">
              <span style={{ ...styles.dot, background: connected ? '#12b76a' : '#98a2b3' }} />
              {connected ? copy.connected : copy.disconnected}
            </div>
            {connected
              ? <div style={styles.meta}>{[status.email, status.planType].filter(Boolean).join(' · ')}</div>
              : null}
          </div>
        </div>
        <div style={styles.actions}>
          {connected
            ? <button type="button" style={styles.button} disabled={busy} onClick={() => { void logout() }}>{copy.logout}</button>
            : <button type="button" style={{ ...styles.button, ...styles.primary }} disabled={busy || waiting} onClick={() => { void login() }}>{waiting ? copy.waiting : copy.login}</button>}
          <button type="button" style={styles.button} disabled={busy} onClick={() => { void refresh() }}>{copy.refresh}</button>
        </div>
        {authUrl === undefined ? null : <p><a href={authUrl} target="_blank" rel="noreferrer">{copy.popup}</a></p>}
        {error === undefined ? null : <p style={styles.error} role="alert">{error}</p>}
        <div style={styles.models}>
          <strong>{copy.models}</strong>
          {status?.models.length
            ? <ul style={styles.list}>{status.models.map(model => <li key={model.id}>{model.name} <code>{model.id}</code></li>)}</ul>
            : <p style={styles.meta}>{copy.noModels}</p>}
        </div>
      </div>
    </section>
  )
}

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'openai-oauth',
    order: 11,
    label: () => 'OpenAI OAuth',
  }, OpenAiOAuthSection))
}
