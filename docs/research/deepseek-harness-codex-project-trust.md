# DeepSeek Harness 中的 Codex 项目信任告警

## 结论

这条告警不是 OAuth 或模型故障，而是 Codex 的项目级配置安全门：从 `/Users/dgpisces` 启动 Harness 时，Codex 把该目录当作当前项目，并发现 `/Users/dgpisces/.codex`。由于本插件给 Codex 使用独立的 `CODEX_HOME=/Users/dgpisces/.deepseek-harness/codex`，前者不再是当前 Codex 实例的用户配置目录，而会被识别成项目级 `.codex/` 层；未信任时，Codex 禁用其中的 config、hooks 和 exec policies，但仍加载 skills。

如果继续从 `~` 启动，准确且唯一能匹配当前告警的信任项是：

```toml
# /Users/dgpisces/.deepseek-harness/codex/config.toml
[projects."/Users/dgpisces"]
trust_level = "trusted"
```

不要把它写进 `/Users/dgpisces/.codex/config.toml`：OpenAI 文档说明用户配置位于 `CODEX_HOME/config.toml`，而本插件明确把 `CODEX_HOME` 设为 `~/.deepseek-harness/codex`。也不要把 key 写成 `/Users/dgpisces/.codex`；Codex 要求的是项目路径，不是被发现的 `.codex` 文件夹路径。

不过，信任整个 home 会允许 `/Users/dgpisces/.codex` 中的项目级配置、hooks 和 exec policies 加载，权限范围过大。推荐的最小权限方案是从具体仓库启动：

```bash
cd "/Users/dgpisces/Claude Code/deepseek-harness-chatgpt"
npx @deepseek-ai/dsh web
```

Codex 默认以 `.git` 作为项目根标记，只从该根到当前工作目录扫描 `.codex/` 层。因此从这个仓库启动不会继续向上扫描 `/Users/dgpisces/.codex`。当前仓库没有 `.codex/`，所以不需要增加任何信任项。如果以后确实要启用该仓库自己的 `.codex/config.toml`、hooks 或 exec policies，再在 Harness 专用配置中加入：

```toml
# /Users/dgpisces/.deepseek-harness/codex/config.toml
[projects."/Users/dgpisces/Claude Code/deepseek-harness-chatgpt"]
trust_level = "trusted"
```

这个仓库级条目不能消除“从 `~` 启动”产生的当前告警，因为 Codex 的未命中回退 key 是当前检测到的项目根 `/Users/dgpisces`。

## 官方依据

1. DeepSeek Harness 的官方 profile 把默认 workspace root 设为 `process.cwd()`，即启动 Harness 的当前目录。因此在提示符 `~ %` 下运行，Harness 工作区是 `/Users/dgpisces`。来源：[DeepSeek Harness `packages/bundle/base/cordis.patch.yml`](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/bundle/base/cordis.patch.yml#L166-L176)。
2. 本 OAuth provider 默认返回 `~/.deepseek-harness/codex`，并在启动官方 Codex app-server 子进程时显式设置 `CODEX_HOME`；没有设置另一个子进程 `cwd`。来源：[本仓库 `src/paths.ts`](https://github.com/DGPisces/deepseek-harness-openai-oauth/blob/dce6b795430f725584f45ac83e3e1e56c7f6b2a1/src/paths.ts#L1-L7)、[`src/app-server.ts`](https://github.com/DGPisces/deepseek-harness-openai-oauth/blob/dce6b795430f725584f45ac83e3e1e56c7f6b2a1/src/app-server.ts#L62-L90)。所以 `~/.deepseek-harness/codex` 来自 provider 隔离设计，不是 DeepSeek Harness 核心默认值。
3. OpenAI 官方文档说明 `CODEX_HOME` 默认为 `~/.codex`，其中的 `config.toml` 是用户配置；项目 `.codex/config.toml` 只有在项目受信任时才加载。[Advanced Configuration: Config and state locations](https://developers.openai.com/codex/config-advanced#config-and-state-locations)、[Project config files](https://developers.openai.com/codex/config-advanced#project-config-files-codexconfigtoml)。Codex 0.146.0 源码同样首先读取 `CODEX_HOME` 环境变量：[home-dir source](https://github.com/openai/codex/blob/e363b08c9175ac1cbe5893615dd2cb9ddf95043b/codex-rs/utils/home-dir/src/lib.rs#L5-L17)。
4. OpenAI 官方文档说明项目配置扫描范围是项目根到 cwd，默认项目根标记是 `.git`：[Project root detection](https://developers.openai.com/codex/config-advanced#project-root-detection)。0.146.0 源码中的默认 marker 和根查找实现与文档一致：[markers](https://github.com/openai/codex/blob/e363b08c9175ac1cbe5893615dd2cb9ddf95043b/codex-rs/config/src/project_root_markers.rs#L5-L5)、[root lookup](https://github.com/openai/codex/blob/e363b08c9175ac1cbe5893615dd2cb9ddf95043b/codex-rs/config/src/loader/mod.rs#L1154-L1176)。没有找到 marker 时，源码返回 cwd 本身。
5. Codex 从 cwd 到项目根检查每个 `<dir>/.codex`，只跳过与当前 `CODEX_HOME` 相同的目录：[project layer scan](https://github.com/openai/codex/blob/e363b08c9175ac1cbe5893615dd2cb9ddf95043b/codex-rs/config/src/loader/mod.rs#L1214-L1261)。这里 `/Users/dgpisces/.codex` 不等于 `/Users/dgpisces/.deepseek-harness/codex`，所以不会被跳过。
6. 未找到显式信任时，Codex 优先用 Git repo root，否则用检测到的 project root 作为提示中的 trust key；源码也直接生成“把该 key 加进当前用户配置”的告警：[trust decision](https://github.com/openai/codex/blob/e363b08c9175ac1cbe5893615dd2cb9ddf95043b/codex-rs/config/src/loader/mod.rs#L861-L920)。官方配置参考确认准确键为 `projects.<path>.trust_level`，合法值为 `trusted` 或 `untrusted`：[Configuration Reference](https://developers.openai.com/codex/config-reference#projects-path-trust-level)。

## 修改建议

- provider 启动 Codex app-server 时，将子进程 `cwd` 固定为独立的 `CODEX_HOME`。
- Harness 的实际工作目录仍通过 `thread/start.cwd` 传入，Harness plugins、tools 和 agent loop 不变。
- 不增加 home 级信任，也不加载 Codex 的项目配置、hooks、exec policies 或 plugins。

## 对照：Hermes Agent

Hermes **确实支持 Codex app-server**，但它没有自动添加项目信任。它默认不传 `CODEX_HOME`，让 Codex 继续使用 `~/.codex`；同时把实际会话目录传给 `thread/start.cwd`。因此从 `~` 启动时，`~/.codex` 正好是用户配置目录，Codex 会跳过同一路径的项目层，不会产生本项目这种“两个 Codex home 不相等”的告警。

官方源码（本机官方 checkout：`NousResearch/hermes-agent`，提交 `222465d84709379b65173b0283a6eea87516acfa`）：

- 仅在调用方明确提供时才覆盖 `CODEX_HOME`，启动 app-server 时也不另设进程 `cwd`：[codex_app_server.py](https://github.com/NousResearch/hermes-agent/blob/222465d84709379b65173b0283a6eea87516acfa/agent/transports/codex_app_server.py#L90-L94)、[subprocess](https://github.com/NousResearch/hermes-agent/blob/222465d84709379b65173b0283a6eea87516acfa/agent/transports/codex_app_server.py#L126-L142)。
- Hermes 解析真实会话目录，并传给 `CodexAppServerSession`：[codex_runtime.py](https://github.com/NousResearch/hermes-agent/blob/222465d84709379b65173b0283a6eea87516acfa/agent/codex_runtime.py#L701-L750)；最终发送 `thread/start { cwd }`：[codex_app_server_session.py](https://github.com/NousResearch/hermes-agent/blob/222465d84709379b65173b0283a6eea87516acfa/agent/transports/codex_app_server_session.py#L315-L346)。
- 官方文档明确说明默认共享 `~/.codex`，只有用户主动要求多 profile 隔离时才设置自定义 `CODEX_HOME`：[Codex app-server runtime](https://github.com/NousResearch/hermes-agent/blob/222465d84709379b65173b0283a6eea87516acfa/website/docs/user-guide/features/codex-app-server-runtime.md#L311-L331)。

结论：Hermes 不是“修复了 Codex 信任机制”，而是默认配置避开了冲突。若 Hermes 用户主动设置独立 `CODEX_HOME`，又从 home 启动，同类告警仍可能出现。要完全照搬 Hermes，需取消本插件强制的 `~/.deepseek-harness/codex`，改用 `~/.codex`；代价是与 Codex CLI 共享登录、配置和插件状态。

## 与 DeepSeek Harness LLM provider 架构的关系

### 结论

本插件接入点是正确的：DeepSeek Harness 官方把“新增模型提供方”定义为实现 `LlmAdapter.stream()` 并通过 `ctx.llm.registerAdapter()` 注册；Harness 自己负责 agent loop、消息日志、prompt/tool schema 组装和工具执行。因此 Codex 应只作为 OAuth 模型传输层，不应接管 Harness 的 plugins、tools、session 或 compaction。

当前 `dynamicTools` 桥接符合这个边界：插件把 Harness 组装的 tool schema 传给 app-server，把 `item/tool/call` 转成标准 `tool-call` chunk；随后仍由 Harness agent loop 调用 `ctx.tools` 执行并记录结果。`dsh-base` 中的工具、skills、subagent、compaction、session persistence 等插件不会因为增加一个 LLM adapter 而被替换。

app-server 子进程的启动 `cwd` 应指向私有 `CODEX_HOME`，避免启动阶段扫描 Harness 工作目录的 Codex 项目层。`thread/start.cwd` 继续保留真实 Harness workspace；Codex 内置 tools、plugins、hooks、agents、skill search 和项目指令已被显式关闭，Harness 仍是实际工作区与工具执行的唯一控制方。

不建议尝试“移除 Codex app-server 的 agent loop”：ChatGPT OAuth 在这里通过 app-server 协议提供，并不是原始的无状态模型 API。可行边界是继续关闭 Codex 内置 tools/plugins/hooks/agents，只保留模型生成与 `dynamicTools` 回调，由 Harness 外层循环执行真正的工具调用。

### 最小修改方案

1. `AppServer` 以私有 home 作为 `spawn(..., { cwd })`。
2. 保留现有 `thread/start.cwd`、`ctx.llm.registerAdapter()`、`dynamicTools` 和 Harness 工具结果回传逻辑。
3. 不改 README，不增加信任项，不共享 `~/.codex`。

这只解决隔离和告警。当前 adapter 仍以进程内 `sessions` map 保存 Codex thread，并在后续 `stream()` 中续接未完成的 Codex turn；它不是严格无状态的 API adapter。Harness 重启、HMR、fork/resume 或 compaction 后如何从 Harness 日志恢复 provider-native 状态，需要另行验证或重构，不能把本次 cwd 修改宣传成完整的“原始模型 API 等价”。

### DeepSeek 官方依据（固定提交 `47f943859bef60e4160492346772ded9b24f765a`）

- Harness 架构说明所有能力都是 Cordis 插件；model adapter、tool registry、session log、agent loop 相互独立，新增模型 provider 的官方机制就是注册 `ctx.llm` adapter：[architecture.md](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/architecture.md#L9-L27)、[architecture.md](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/architecture.md#L39-L52)、[architecture.md](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/architecture.md#L104-L120)。
- 官方 adapter cookbook 的最小形态正是继承 `LlmAdapter`、实现 `stream()`、调用 `ctx.llm.registerAdapter()`；`GenerateOptions` 中包含 Harness 已组装的消息、tools 和取消信号：[adding-an-llm-adapter.md](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/cookbook/adding-an-llm-adapter.md#L5-L35)。
- 官方 agent loop 每一步组装完整请求、调用 adapter stream、把输出写入 session；发现标准 `tool-call` block 后，由 Harness 的 `executeToolCalls()` 执行：[agent.ts](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/agent-loop/src/agent.ts#L332-L400)、[agent.ts](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/agent-loop/src/agent.ts#L403-L494)。
- `dsh-base` 独立挂载 LLM runtime、session、agent、tools、skills、subagent、compaction 和 persistence；新增 adapter 不替换这些行：[cordis.patch.yml](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/bundle/base/cordis.patch.yml#L24-L107)、[cordis.patch.yml](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/bundle/base/cordis.patch.yml#L210-L249)、[cordis.patch.yml](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/bundle/base/cordis.patch.yml#L281-L361)。
