# dsh-openai-oauth

[English](README.md) | 简体中文

这个插件可以把 ChatGPT 账户中的 GPT 模型接入 DeepSeek Harness，并作为主模型使用。Harness 仍然负责 Agent 循环和工具执行。插件通过 OpenAI 官方的本地 Codex app-server 完成 ChatGPT 登录、凭据保存、token 刷新和模型调用。

整个过程不需要 OpenAI API Key。插件不会读取其他 Codex 安装的 `auth.json`，不会自行实现 OAuth，也不会直接调用未公开的 ChatGPT 接口。

## 环境要求

- Node.js 22.19 或更高版本
- DeepSeek Harness 开发预览版 `0.1.0-rc.6`
- 已开通 Codex 权限的 ChatGPT 账户

## 安装

只需运行一条命令：

```sh
npx -y dsh-openai-oauth install
```

安装器会把插件注册到 `web`、`headless` 和当前已有的自定义 profile。如果发现旧包 `deepseek-harness-openai-oauth` 或 `dsh-llm-codex-app-server`，也会自动迁移。

以后更新插件时，重新运行同一条命令即可。如果安装后又新建了自定义 profile，也需要再运行一次，让安装器完成注册。

## 使用 ChatGPT 登录

启动 Harness Web 界面：

```sh
npx @deepseek-ai/dsh web
```

进入“设置 > OpenAI OAuth”，点击“使用 ChatGPT 登录”，然后在 OpenAI 页面完成授权。登录成功后，当前账户可用的 GPT 模型会出现在 Harness 原有的模型选择器中。

如果使用 headless profile，可以在终端登录：

```sh
npx @deepseek-ai/dsh plugin --profile headless exec dsh-codex-login
```

登录数据单独保存在 `~/.deepseek-harness/codex`。凭据保存和 token 刷新均由 Codex 处理。

## 选择模型

你可以直接在 Harness 界面中选择提供方和模型，也可以编辑 `~/.dsh/settings.yaml`：

```yaml
agent-default-model:
  provider: openai-codex
  model: gpt-5.6-sol
  reasoningEffort: high
```

之后正常运行 Harness：

```sh
npx @deepseek-ai/dsh --profile headless "检查这个仓库"
```

模型列表来自当前登录的 Codex 账户，插件不会把 GPT 版本写死在代码中。

## 干净卸载

下面的命令会删除所有当前 Harness profiles 中的插件注册，但保留 ChatGPT 登录，方便以后重新安装：

```sh
npx -y dsh-openai-oauth uninstall
```

如果还要退出登录，并删除 `~/.deepseek-harness/codex` 中的认证数据，请运行：

```sh
npx -y dsh-openai-oauth uninstall --purge-auth
```

这两条命令也会清理旧包名留下的注册。插件通过 `npx` 运行，不会在系统中留下一个长期安装的全局 npm 包。npm 自身仍可能保留普通下载缓存。

## 本地开发

```sh
npm install
npm test
npm pack --dry-run
```

这是一个独立的社区插件，不代表 DeepSeek 或 OpenAI 官方立场。

## 许可证

MIT
