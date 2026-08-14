# DeepSeek Harness ChatGPT OAuth provider

English | [简体中文](README.zh-CN.md)

Use GPT models available to your ChatGPT account as the main model in DeepSeek Harness. DeepSeek Harness keeps control of its agent loop and tools; the provider uses the official local Codex app-server for ChatGPT login and model inference.

This project does not use an OpenAI API key, read another Codex installation's `auth.json`, implement OAuth, or call the unpublished ChatGPT backend directly.

## Requirements

- Node.js 22.19 or newer
- DeepSeek Harness developer preview `0.1.0-rc.6`
- A ChatGPT account with Codex access

## Global install

Install the package once, then register it with every current Harness profile
(including `web`, `headless`, and existing custom profiles):

```sh
npm install --global https://github.com/DGPisces/deepseek-harness-chatgpt/archive/refs/tags/v0.2.1.tar.gz
dsh-codex install
```

If npm's global bin directory is not on `PATH`, run:

```sh
"$(npm prefix --global)/bin/dsh-codex" install
```

Re-run `dsh-codex install` after creating a new custom profile.

Start the web UI:

```sh
npx @deepseek-ai/dsh web
```

Open **Settings → OpenAI OAuth → Sign in with ChatGPT**. After authorization,
the models available to the signed-in account appear in the normal Harness
model picker.

## Profile-only install

For the Harness web UI:

```sh
npx @deepseek-ai/dsh plugin --profile web add github:DGPisces/deepseek-harness-chatgpt
npx @deepseek-ai/dsh web
```

Open **Settings → OpenAI OAuth → Sign in with ChatGPT**. After authorization,
the models available to the signed-in account appear in the normal Harness
model picker.

For a headless profile:

```sh
npx @deepseek-ai/dsh plugin --profile headless add github:DGPisces/deepseek-harness-chatgpt
npx @deepseek-ai/dsh plugin --profile headless exec dsh-codex-login
```

The login is isolated under `~/.deepseek-harness/codex`. Codex owns credential storage and token refresh.

Select a model advertised by Codex, for example:

```yaml
# ~/.dsh/settings.yaml
agent-default-model:
  provider: openai-codex
  model: gpt-5.6-sol
  reasoningEffort: high
```

Then run Harness normally:

```sh
npx @deepseek-ai/dsh --profile headless "inspect this repository"
```

Model availability comes from the signed-in Codex account and is not hardcoded by this plugin.

## Why OAuth is next to Models

DeepSeek Harness `0.1.0-rc.6` exposes whole settings sections to plugins, but
does not expose a child slot inside its built-in Models page. The OAuth section
is therefore placed immediately after Models. Replacing or copying the Models
page would be brittle, and the Harness contribution guide currently does not
accept external pull requests. The plugin can move the same OAuth card into
Models when Harness publishes a supported child slot.

## Uninstall

Remove the plugin from every current Harness profile while keeping the local
OAuth login for a later reinstall:

```sh
dsh-codex uninstall
npm uninstall --global dsh-llm-codex-app-server
```

For a clean uninstall that also logs out and removes the isolated OAuth data
under `~/.deepseek-harness/codex`:

```sh
dsh-codex uninstall --purge-auth
npm uninstall --global dsh-llm-codex-app-server
```

The same `$(npm prefix --global)/bin/dsh-codex` fallback applies to both
uninstall commands.

If the global command was removed first, remove the profile registrations
manually:

```sh
npx @deepseek-ai/dsh plugin --profile web remove dsh-llm-codex-app-server
npx @deepseek-ai/dsh plugin --profile headless remove dsh-llm-codex-app-server
```

## Local verification

```sh
npm install
npm test
npm pack --dry-run
```

The real-provider smoke test used GPT-5.6 Sol as the Harness main model, asked it to call Harness's `bash` tool, and received the tool result back in the same Codex turn.

## Status and limitations

- Codex app-server dynamic tools are experimental, so `@openai/codex` is pinned to `0.146.0`.
- Text, reasoning, model discovery, reasoning effort, and Harness tool calls are supported.
- Image input and per-turn `stop`, `temperature`, and `maxTokens` are rejected explicitly.
- Active app-server threads are process-local; restart recovery is not implemented.

This is an independent community plugin and is not endorsed by DeepSeek or OpenAI.

## License

MIT
