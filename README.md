# DeepSeek Harness ChatGPT OAuth provider

Use GPT models available to your ChatGPT account as the main model in DeepSeek Harness. DeepSeek Harness keeps control of its agent loop and tools; the provider uses the official local Codex app-server for ChatGPT login and model inference.

This project does not use an OpenAI API key, read another Codex installation's `auth.json`, implement OAuth, or call the unpublished ChatGPT backend directly.

## Requirements

- Node.js 22.19 or newer
- DeepSeek Harness developer preview compatible with commit `47f943859bef60e4160492346772ded9b24f765a`
- A ChatGPT account with Codex access

## Install

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
