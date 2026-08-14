# DeepSeek Harness × ChatGPT OAuth LLM Provider 调研

> 调研日期：2026-08-14
>
> DeepSeek Harness 快照：[`47f943859bef60e4160492346772ded9b24f765a`](https://github.com/deepseek-ai/deepseek-harness/tree/47f943859bef60e4160492346772ded9b24f765a)
>
> Hermes Agent 快照：[`edb33be51164b7ab5edf8e31c28cba5c8fcc993d`](https://github.com/NousResearch/hermes-agent/tree/edb33be51164b7ab5edf8e31c28cba5c8fcc993d)
> 范围：DeepSeek 官方仓库、Nous Research 官方 Hermes 仓库、OpenAI 官方文档与条款。不研究 subagent 方案。

## 结论

1. **DeepSeek Harness 可以在不修改 agent loop、也不把 Codex 当子代理的情况下，把 GPT-5.6 注册为真正的主模型 provider。** 正确扩展点是 `LlmAdapter.stream()` 与 `ctx.llm.registerAdapter()`；Harness 的 agent loop 仍负责上下文、工具调用和会话记录。[[LlmAdapter]](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/llm/llm/src/index.ts#L132-L192) [[官方 adapter 指南]](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/cookbook/adding-an-llm-adapter.md)
2. **严格同时满足“Harness 原生 agent loop + ChatGPT/Codex OAuth + 非 API key + 直接模型流”的官方受支持路径，目前没有被 OpenAI 公共文档建立。** OpenAI 公布的 ChatGPT OAuth 宿主集成边界是 Codex app-server；它暴露的是 Codex thread/turn、审批和 agent event 协议，不是原始 Responses API provider 接口。[[Codex app-server]](https://developers.openai.com/codex/app-server)
3. **Hermes 证明了技术可行性，但不是 OpenAI 支持性证明。** Hermes 的 `openai-codex` 是主模型 provider，直接请求 `https://chatgpt.com/backend-api/codex`，自行做 OAuth、token 刷新和 Responses SSE 翻译；其源码同时明确称模型白名单会漂移、接口未文档化，并伪装 `originator: codex_cli_rs` 与 Codex 形状的 `User-Agent` 来避免 Cloudflare 403。[[provider 配置]](https://github.com/NousResearch/hermes-agent/blob/edb33be51164b7ab5edf8e31c28cba5c8fcc993d/hermes_cli/providers.py) [[请求头实现]](https://github.com/NousResearch/hermes-agent/blob/edb33be51164b7ab5edf8e31c28cba5c8fcc993d/agent/auxiliary_client.py)
4. **因此不建议直接把 Hermes 式 raw backend 方案作为公开插件的默认实现。** 可以先做本地、显式 opt-in 的实验 PoC；公开发布前应取得 OpenAI 对 endpoint、OAuth client、请求头、订阅用量和第三方客户端使用方式的公开或书面确认。OpenAI 条款禁止绕过限制或保护措施；此处只是工程风险判断，不是法律意见。[[OpenAI Terms of Use]](https://openai.com/policies/terms-of-use/)
5. **DeepSeek 的开源规则很明确：独立 GitHub 仓库、添加 `dsh-plugin` topic，不向官方仓库提 PR。** Harness 仍处于 developer preview，兼容性可能破坏性变化。[[README]](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/README.md) [[CONTRIBUTING]](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/CONTRIBUTING.md)
6. **“闪电说”不是 Codex OAuth 先例。** 其公开资料显示它是本地 Agent：自接在线模型时使用 API Key 直连服务商，也可走本地 Ollama/LM Studio 或厂商会员转发。公开 GitHub 仓库只有 README/安装包 release，没有 provider/auth 源码；没有证据表明它使用 Codex CLI、app-server 或 raw ChatGPT backend OAuth。[[闪电说文档]](https://shandianshuo.cn/docs) [[隐私与数据路径]](https://shandianshuo.cn/privacy-first) [[公开 release 仓库]](https://github.com/shandianshuo/shandianshuo-releases)

## DeepSeek Harness 的直接 LLM provider seam

### 注册边界

最小 adapter 形态是：

```ts
class ChatGptCodexAdapter extends LlmAdapter {
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // ChatGPT OAuth transport -> Harness StreamChunk
  }
}

export const name = "llm-chatgpt-codex";
export const inject = ["llm"];

export function apply(ctx: Context, config: Config) {
  ctx.llm.registerAdapter(
    ["chatgpt-codex"],
    new ChatGptCodexAdapter(/* dependencies */),
  );
}
```

- `GenerateOptions.provider` 选择 adapter route；`model` 是 provider 自己解释的模型 ID。无需在 agent loop 中硬编码 GPT-5.6。[[GenerateOptions]](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/llm/llm/src/types.ts#L319-L356)
- `StreamChunk` 必须翻译文本、reasoning、tool-call、usage 和 terminal finish；tool arguments 必须保留 raw JSON string。[[StreamChunk]](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/llm/llm/src/types.ts#L283-L303)
- 强制契约包括：usage 先于 finish、finish 后不再 emit、block index 稳定、尊重 `AbortSignal`、不支持的字段抛 `UNSUPPORTED`、provider continuation 写入 `replayState`、每个请求带 Harness attribution header。[[adapter 指南]](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/cookbook/adding-an-llm-adapter.md) [[streaming 契约]](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/subsystems/llm-streaming.md)
- 可选实现 `providerInfo()`、`providerRetryPolicy()`、`listModels()` 和 `resolveModel()`，用于模型目录、context、默认输出长度和 reasoning efforts。
- adapter 每次调用只执行一次 provider attempt，不应在内部静默重试；重试交给 Harness policy。

这条 seam 表明：**无需 subagent，也无需把 Codex 的工具执行交给另一个 agent loop。** adapter 只负责模型 wire protocol，Harness 自己继续执行工具。

### 现有 `llm-pi-ai` 能做什么、不能做什么

Harness 自带的 `@deepseek-ai/dsh-llm-pi-ai` 已识别 `openai / gpt-5.6-sol`，并有 reasoning metadata 测试；OpenAI route 使用 Responses API。[[GPT-5.6 catalog 测试]](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/llm/llm-pi-ai/tests/adapter.spec.ts#L414-L444) [[Responses route 测试]](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/llm/llm-pi-ai/tests/adapter.spec.ts#L189-L199)

但它的 OpenAI 配置要求 API key credential；README 明确 OAuth-only provider 没有登录/刷新 flow。[[llm-pi-ai README]](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/llm/llm-pi-ai/README.md)

因此：

- 若允许 `OPENAI_API_KEY`，现成 adapter 基本够用，不值得新写 provider。
- 本项目明确要求 ChatGPT/Codex OAuth、不要 API key，所以必须增加 OAuth 生命周期与对应 transport；不能只把 access token 填进 `apiKeyEnv`，也不能把 `Authorization` 明文写入 `headers`。
- 官方 Harness 对 `gpt-5.6-sol` 的证据目前是 catalog 单测，不是 live e2e；现有 OpenAI live e2e 默认仍使用 GPT-5.5。[[provider e2e]](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/llm/llm-pi-ai/tests/provider-apis.e2e.ts)

OpenAI 官方模型指南说明 `gpt-5.6` alias 指向 `gpt-5.6-sol`，另有 `gpt-5.6-terra` 与 `gpt-5.6-luna`。这只证明公开模型命名，不证明 ChatGPT Codex backend 对每个订阅账户开放同一组 ID。[[GPT-5.6 model guidance]](https://developers.openai.com/api/docs/guides/latest-model)

## Hermes Agent 的实现拆解

Hermes 的实现是真正的主模型 provider，不是 subagent：

```text
Hermes agent loop
  -> openai-codex provider
  -> OAuth access token + ChatGPT account id
  -> chatgpt.com/backend-api/codex/responses
  -> raw SSE event translator
  -> Hermes tool loop
```

主要组成如下：

1. **Provider overlay**：`openai-codex` 使用 `codex_responses` transport、`oauth_external` auth 和 consumer Codex backend URL。[[providers.py]](https://github.com/NousResearch/hermes-agent/blob/edb33be51164b7ab5edf8e31c28cba5c8fcc993d/hermes_cli/providers.py)
2. **OAuth manager**：Hermes 内置 device-code、token exchange、refresh、过期判断与本地 credential pool，也能只读导入 `CODEX_HOME/auth.json`。[[auth.py]](https://github.com/NousResearch/hermes-agent/blob/edb33be51164b7ab5edf8e31c28cba5c8fcc993d/hermes_cli/auth.py)
3. **刷新并发处理**：源码特别处理 refresh token 单次轮换与并发刷新竞争；复制 Codex CLI token 后，Codex CLI 与 Hermes 同时刷新可能使另一方失效。这意味着“直接复用同一个 `auth.json` 并各自刷新”不是安全设计。
4. **请求头与 account ID**：Hermes 从 JWT 中取 ChatGPT account ID，发送 `ChatGPT-Account-ID`，并将 `originator`/`User-Agent` 伪装成 `codex_cli_rs`；源码说明这是为通过第一方 originator allowlist、避免 403。[[auxiliary_client.py]](https://github.com/NousResearch/hermes-agent/blob/edb33be51164b7ab5edf8e31c28cba5c8fcc993d/agent/auxiliary_client.py)
5. **Responses SSE 兼容层**：Hermes 直接消费 raw Responses events，并对 consumer backend 与 SDK typed model 的漂移做兼容。[[codex_runtime.py]](https://github.com/NousResearch/hermes-agent/blob/edb33be51164b7ab5edf8e31c28cba5c8fcc993d/agent/codex_runtime.py)
6. **模型列表不硬编码**：Hermes 自己说明 ChatGPT-account backend 的模型 allowlist 未文档化且会变化。

可以借鉴的是模块边界、token 轮换测试和 SSE 翻译方法；**不应未经确认直接复制 endpoint、OAuth client ID、第一方 originator 或规避 403 的 header 行为。** Hermes 使用 MIT License；若复制其代码或实质性部分，必须保留其版权与许可声明。[[Hermes LICENSE]](https://github.com/NousResearch/hermes-agent/blob/edb33be51164b7ab5edf8e31c28cba5c8fcc993d/LICENSE)

## OpenAI 官方 OAuth 边界

OpenAI 官方文档确认：

- Codex CLI、IDE 和 ChatGPT desktop 可用 ChatGPT 登录；Codex 会保存并自动刷新 token。file-backed credential 位于 `~/.codex/auth.json`，也可能在 OS keyring。该文件是明文敏感凭证，应按密码保护，不能提交、贴到 issue 或写入日志。[[Codex authentication]](https://developers.openai.com/codex/authentication)
- Codex app-server 是给第三方产品深度嵌入 Codex 的官方协议，包含 authentication、conversation history、approvals 和 streamed agent events。[[app-server 概览]](https://developers.openai.com/codex/app-server)
- app-server 支持 managed ChatGPT OAuth：由 Codex 完成 browser/device-code 登录、持久化和刷新；文档还列出实验性的 `chatgptAuthTokens`，但只适用于宿主已经拥有完整 ChatGPT auth lifecycle 的场景，宿主必须响应 refresh request。当前 OpenAI Codex 协议源码进一步把该 external-token 模式标为 unstable、仅供 OpenAI 内部使用，因此社区插件不应选它。[[app-server auth endpoints]](https://developers.openai.com/codex/app-server#auth-endpoints) [[Codex auth protocol source]](https://github.com/openai/codex/blob/9d012ca4f54c5adc86e605a7bedbdd03ef63f516/codex-rs/app-server-protocol/src/protocol/common.rs)

OpenAI 公共文档没有把以下内容定义为第三方 provider API：

- `https://chatgpt.com/backend-api/codex/responses`
- Hermes 使用的 OAuth public client ID
- `originator: codex_cli_rs`
- Codex 形状的 `User-Agent`
- 直接 bearer + `ChatGPT-Account-ID` 调 consumer backend 的稳定协议
- ChatGPT 订阅 backend 的稳定 GPT-5.6 allowlist

所以，**Hermes 的存在只能证明实现能工作，不能证明 OpenAI 对该调用方式提供兼容性、授权或账户安全承诺。**

## “闪电说”的可借鉴边界

本次能定位到的公开项目是探未（武汉）科技有限公司的 [闪电说](https://shandianshuo.cn/)，不是开源 LLM harness。公开证据建立的架构是：

```text
本地桌面 Agent
  ├─ 本地语音/本地模型：数据不离设备
  ├─ 自接模型：本机保存 API Key，客户端直连所选服务商
  └─ 会员模型：经闪电说服务转发，不要求用户填写 API Key
```

- 官网明确称本体运行在本机，知识库、记忆和配置存本地。[[隐私页]](https://shandianshuo.cn/privacy-first)
- 自接 OpenAI、DeepSeek、OpenRouter、Ollama、LM Studio 等模型时，官方文档使用“自己的模型 API/API Key”表述；隐私页称调用从用户电脑直达服务商。[[入门指南]](https://shandianshuo.cn/docs)
- 会员模型是闪电说自己的转发服务，不等于复用用户 ChatGPT/Codex OAuth。
- GitHub 的 `shandianshuo-releases` 只有发行说明和二进制 release，不含应用源码，无法审计 token 存储、HTTP endpoint 或 provider 实现。[[release repository]](https://github.com/shandianshuo/shandianshuo-releases)

因此对三种候选分类的判断是：

| 候选 | 公开证据 |
| --- | --- |
| Codex CLI / app-server | 未发现 |
| 本地 Agent / 本地 provider router | **已确认** |
| 直接调用 ChatGPT backend OAuth | 未发现；公开说明反而指向 API Key 或厂商会员转发 |

可借鉴的是产品边界：本地优先、凭证留在本机、用户明确选择数据路径、每个 provider 独立健康检查。不能借它证明 ChatGPT OAuth raw backend 合法或稳定。对本项目而言，最稳妥的对应设计是：Harness 插件保持本地运行；OAuth 交给 OpenAI 官方 app-server managed login；只有完成“app-server 不接管 Harness tool loop”的 spike 后，才决定是否能包装为 `LlmAdapter`。

## 三种架构选择

| 方案 | Harness loop 是否主导 | OAuth 支持状态 | 结论 |
| --- | --- | --- | --- |
| A. Hermes 式 raw ChatGPT backend adapter | 是 | OpenAI 未公开记录该 provider wire；Hermes 自行实现 | 技术上最贴合目标；只做本地实验，不宜直接公开默认启用 |
| B. Codex app-server-backed adapter | 不完全确定；app-server 自带 thread/turn、工具与审批语义 | OpenAI 官方记录，部分能力仍 experimental | OAuth 最正规，但需先证明能禁用 Codex 自己的 agent/tool loop，并无损映射成 Harness `StreamChunk` |
| C. 官方 OpenAI API + `llm-pi-ai` | 是 | API key，不是 ChatGPT OAuth | 技术最简单，但不满足用户明确要求 |

当前没有证据表明 app-server 提供“只做原始模型推理、不接管 agent 语义”的 RPC。因此 B 不能在研究阶段直接宣称是 drop-in `LlmAdapter`；应做一个独立的 protocol spike 验证。

## 建议的 PoC 边界

### Phase 0：先验证官方 app-server 能否保持 Harness loop 权威

只做最小 spike，不发布：

1. 用 app-server managed `chatgpt`/`chatgptDeviceCode` 完成 OAuth，不直接读取或写入 Codex token 文件。
2. 查明能否让 app-server 仅返回模型 text/reasoning/tool-call，而不自行执行 shell、patch、MCP 或审批。
3. 把一次 turn 映射为 Harness `StreamChunk`，验证 Harness 自己完成 tool call → tool result → 下一轮模型请求。
4. 若 app-server 强制拥有 Codex thread/agent 状态，判定它不满足“真正的 Harness-native provider”，停止这条路线。

### Phase 1：仅在获得确认后实现 raw provider

如果 OpenAI 明确允许第三方直接使用 consumer Codex backend，再实现：

```text
package/bundle
  -> ChatGPT OAuth manager
  -> token store + single-flight refresh
  -> ChatGPT Codex Responses serializer/SSE parser
  -> Harness ChatGptCodexAdapter
  -> model resolver + rate-limit/error mapping
```

保持最小边界：一个唯一 route（如 `chatgpt-codex`）、用户显式选择模型、不修改默认 agent model、不添加 UI、数据库或多 provider 抽象。不得与已有 `openai` route 冲突。

## 本地测试与发布门槛

### Keyless 测试

1. **OAuth state machine**：首次登录、过期、401 refresh、refresh token 轮换、并发请求 single-flight、取消、登出；任何日志和 snapshot 都不得出现 token。
2. **token store**：原子写、0600 文件权限、损坏文件、OS keyring/file 两种模式；不得让 Harness tool 上下文读取 credential 内容。
3. **wire contract**：文本、reasoning、tool-call raw JSON、usage-before-finish、finish 后无事件、稳定 block index、abort、provider error、`UNSUPPORTED`、replay state。
4. **真实 Loader composition**：从 profile/bundle 安装，通过 Loader 注册唯一 route；不要只手动调用 `apply()`。
5. **built artifact smoke**：从 `pnpm pack` tarball 在干净 profile 安装并启动，确保不依赖 monorepo/dev 文件。

### 本地真实 smoke

使用测试账户和本机交互登录，至少覆盖：

- `gpt-5.6-sol` 文本流；
- reasoning effort；
- 一次 Harness 工具调用及 tool result 回传；
- 取消；
- usage/rate-limit 可观测性；
- token 过期后的单次刷新；
- Harness session 中没有 bearer、refresh token 或完整 JWT。

不要把真实 OAuth token 放入 CI。若官方 endpoint/模型 allowlist 变化，测试应明确失败，不要静默切换模型或退回 API key。

DeepSeek 官方 monorepo 要求 unit、per-file 100% coverage、keyless contract、真实 Loader composition、real-API e2e、用户可见协议 snapshot 和 built-entry smoke；外部插件没有强制认证流程，但应把这些作为 provider 发布基线。[[testing policy]](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/testing.md)

## 打包、许可与公开发布规则

- 外部插件的发布单元是 bundle：`package.json` 用 `dsh.bundle.patch` 指向 `cordis.patch.yml`，再向 profile 插入 adapter row。[[publish guide]](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/user/develop/basic/publish.md)
- 本地可用 `dsh plugin --profile <name> add ./<plugin-dir>`，随后用 `--dump-config` 检查组合结果。
- GitHub 安装可使用 `github:<owner>/<repo>`；若依赖 `prepare` 构建，用户必须授权 pnpm `allowBuilds`。更安全的发布物是预构建 npm 包或 `pnpm pack` tarball。
- DeepSeek Harness 是 MIT；复制其代码或实质性部分需保留版权与许可。[[Harness LICENSE]](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/LICENSE)
- 项目应使用独立 GitHub 仓库、添加 `dsh-plugin` topic、记录兼容的 Harness commit/package 版本；不要使用 `@deepseek-ai/*` scope 或暗示官方背书。
- 若复制 Hermes 实现，除保留 Hermes MIT notice 外，还要单独审查其依赖许可证；许可证允许复制代码，不等于 OpenAI 授权使用其服务接口。
- 开源前必须删除 token、`auth.json`、session logs、账户 ID、绝对本机路径和测试账户信息。

## Go / No-Go

**可以 Go：** 创建独立 Git 仓库，先实现 app-server protocol spike，验证能否把它约束为 Harness-native `LlmAdapter`；这一阶段只本地测试，不发布。

**暂时 No-Go：** 未获得 OpenAI 确认前，不把 Hermes 式 `chatgpt.com/backend-api/codex`、第一方 `originator` 伪装和复制的 OAuth client ID 作为公开插件的默认实现或安装说明。

如果 Phase 0 证明 app-server 无法保持 Harness agent loop 权威，那么当前约束组合不存在已证实的官方方案。届时只有两个诚实选择：取得 OpenAI 对 raw provider 的授权/确认，或放宽“非 API key”要求。
