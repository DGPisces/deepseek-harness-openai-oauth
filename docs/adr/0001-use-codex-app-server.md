# Use Codex app-server managed OAuth

Use the official local Codex app-server for managed ChatGPT OAuth, model access, and dynamic tool callbacks. Keep DeepSeek Harness responsible for executing tools by suspending an app-server tool request between Harness calls; do not read `~/.codex/auth.json`, implement OAuth, or call the unpublished ChatGPT backend directly. Dynamic tools are experimental, so the plugin must pin and validate its supported Codex protocol version.
