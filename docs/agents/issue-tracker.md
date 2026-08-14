# Issue tracker: GitHub

任务和需求通过本仓库的 GitHub Issues 管理，使用 `gh` CLI 操作。

- 创建：`gh issue create`
- 查看：`gh issue view <number> --comments`
- 列出：`gh issue list`
- 评论：`gh issue comment <number>`
- 添加或移除标签：`gh issue edit <number>`
- 关闭：`gh issue close <number>`

仓库地址从 `git remote -v` 获取。

## Pull requests as a triage surface

PRs as a request surface: no.

## Skill conventions

当技能要求发布任务时，创建 GitHub Issue；要求读取任务时，使用
`gh issue view <number> --comments`。
