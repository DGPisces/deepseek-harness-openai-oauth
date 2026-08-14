# DeepSeek Harness ChatGPT OAuth 提供方

[English](README.md) | 简体中文

通过 ChatGPT 账户中可用的 GPT 模型作为 DeepSeek Harness 的主模型。Harness
继续负责 Agent 循环和工具执行；本插件通过 OpenAI 官方本地 Codex app-server
完成 ChatGPT 登录、token 刷新和模型调用。

本插件不需要 OpenAI API Key，不读取其他 Codex 安装的 `auth.json`，不自行实现
OAuth，也不直接调用未公开的 ChatGPT 后端。

## 环境要求

- Node.js 22.19 或更高版本
- DeepSeek Harness 开发预览版（已验证 `0.1.0-rc.6`）
- 具备 Codex 使用权限的 ChatGPT 账户

## 全局安装

先全局安装一次插件，再把它注册到当前所有 Harness profiles，包括 `web`、
`headless` 和已经存在的自定义 profile：

```sh
npm install --global https://github.com/DGPisces/deepseek-harness-chatgpt/archive/refs/tags/v0.2.1.tar.gz
dsh-codex install
```

如果 npm 的全局命令目录不在 `PATH` 中，请改用：

```sh
"$(npm prefix --global)/bin/dsh-codex" install
```

以后如果新建了自定义 profile，再运行一次 `dsh-codex install`。

启动 Web 界面：

```sh
npx @deepseek-ai/dsh web
```

进入 **设置 → OpenAI OAuth → Sign in with ChatGPT**，在 OpenAI 官方页面完成
授权。连接成功后，当前账户可用的 GPT 模型会出现在 Harness 的正常模型选择器中。

登录数据隔离保存在 `~/.deepseek-harness/codex`，由 Codex 管理和刷新。

## 仅安装到指定 profile

Web：

```sh
npx @deepseek-ai/dsh plugin --profile web add github:DGPisces/deepseek-harness-chatgpt
```

Headless：

```sh
npx @deepseek-ai/dsh plugin --profile headless add github:DGPisces/deepseek-harness-chatgpt
npx @deepseek-ai/dsh plugin --profile headless exec dsh-codex-login
```

可在 `~/.dsh/settings.yaml` 中选择模型：

```yaml
agent-default-model:
  provider: openai-codex
  model: gpt-5.6-sol
  reasoningEffort: high
```

然后正常运行 Harness：

```sh
npx @deepseek-ai/dsh --profile headless "检查这个仓库"
```

模型列表来自当前登录账户，不在插件中硬编码。

## 为什么 OAuth 暂时位于“模型”旁边

DeepSeek Harness `0.1.0-rc.6` 只向插件开放完整设置页，没有开放内嵌在“模型”
页面中的子插槽。因此 OAuth 入口紧邻“模型”显示。直接替换或复制整个模型页会非常
脆弱，而且 Harness 当前的贡献规则不接受外部 Pull Request。Harness 正式提供模型页
子插槽后，本插件可以把同一张 OAuth 卡片移入“模型”，无需改动认证实现。

## 干净卸载

仅删除所有当前 Harness profiles 中的插件注册，保留 OAuth 登录数据：

```sh
dsh-codex uninstall
npm uninstall --global dsh-llm-codex-app-server
```

完全卸载，同时退出登录并删除 `~/.deepseek-harness/codex`：

```sh
dsh-codex uninstall --purge-auth
npm uninstall --global dsh-llm-codex-app-server
```

两种卸载方式都可以使用 `$(npm prefix --global)/bin/dsh-codex` 作为命令路径。

如果已经先删除了全局命令，可以手动清理标准 profiles：

```sh
npx @deepseek-ai/dsh plugin --profile web remove dsh-llm-codex-app-server
npx @deepseek-ai/dsh plugin --profile headless remove dsh-llm-codex-app-server
```

## 本地验证

```sh
npm install
npm test
npm pack --dry-run
```

## 当前支持范围

- 支持文本、推理、模型发现、推理等级和 Harness 工具调用。
- Codex app-server 的动态工具仍是实验功能，因此固定使用 `@openai/codex@0.146.0`。
- 图片输入以及单轮 `stop`、`temperature`、`maxTokens` 暂不支持并会明确报错。
- app-server thread 仅在当前进程内保存，尚未实现重启恢复。

这是独立的社区插件，不代表 DeepSeek 或 OpenAI 官方立场。

## 许可证

MIT
