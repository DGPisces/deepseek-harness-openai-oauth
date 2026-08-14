# Harness Codex OAuth Provider

This project connects DeepSeek Harness's native LLM seam to Codex models authenticated by a user's ChatGPT subscription.

## Language

**Codex app-server provider**:
The Harness LLM provider backed by the official local Codex app-server and its managed ChatGPT OAuth.
_Avoid_: Codex subagent, OpenAI API provider

**Managed ChatGPT login**:
The Codex-owned OAuth session whose tokens are persisted and refreshed only by Codex.
_Avoid_: Plugin OAuth, copied Codex token, API key

**Harness agent loop**:
The DeepSeek Harness loop that owns tool execution and exposes tool results while app-server provides model inference and a pending dynamic-tool turn.
_Avoid_: Codex subagent
