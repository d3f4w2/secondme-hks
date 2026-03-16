# 2026-03-16 参赛 Skill 栈与启动顺序

这份文档把当前比赛阶段真正需要的 skill 固化下来，目标不是“装得越多越好”，而是用最小但完整的能力栈，尽快做出一个可提交、可演示、可拉 OAuth 用户的 MVP。

## 当前结论

- 现在不需要额外大规模安装 skill。
- `secondme` 系列已经覆盖“选题 -> 需求 -> 生成项目”的主链路。
- 第一梯队增强型 skill 已经可用，足够支撑 UI、演示和基础验证。
- `OpenSpace`、`Superpowers`、`OpenClaw` 一类生态型能力先不作为开工前置条件。

## 核心必用

这些是当前参赛主链路的基础：

- `secondme`
- `secondme-init`
- `secondme-prd`
- `secondme-nextjs`
- `secondme-reference`

用途分工：

- `secondme-reference`：查 Second Me OAuth、API 能力和实现约束。
- `secondme-init`：初始化项目配置和模块选择。
- `secondme-prd`：把比赛题目收敛成可以落地的需求。
- `secondme-nextjs`：生成可继续开发的 Next.js 项目骨架。
- `secondme`：需要一站式跑完整流程时使用。

## 第一梯队增强

这些 skill 已经足够满足“评委观感 + 演示稳定性 + 基础交付质量”的需要：

- `brainstorming`
- `frontend-design`
- `playwright`
- `test-runner`

建议用法：

- `brainstorming`：在正式开做前，先把 A2A 价值、目标用户、MVP 边界定死。
- `frontend-design`：把首屏、核心流程和结果页做得更适合 demo。
- `playwright`：回归 OAuth 登录和演示主路径，必要时顺手出截图。
- `test-runner`：只测关键路径，不追求大而全。

## 第二梯队可选

这些不是开工前必需，但在项目复杂度上升后会有价值：

- `architecture-designer`
- `debug-pro`
- `git-essentials`
- `ui-ux-pro-max`

使用原则：

- 需要更复杂的 Agent 编排、事件流或外部集成时，再启用 `architecture-designer`。
- 接 OAuth、回调、部署时遇到问题，再用 `debug-pro`。
- 如果要做更严格的分支管理，再用 `git-essentials`。
- `ui-ux-pro-max` 和 `frontend-design` 不必一开始同时上；默认优先 `frontend-design`。

## 暂缓项

以下能力暂时不作为当前比赛阶段的前置投入：

- `OpenSpace`
- `Superpowers`
- `OpenClaw`
- 多渠道网关、复杂自动化、社区运营型 skill

延后原因：

- 它们目前不直接决定能否完成最低提交门槛。
- 会分散时间，削弱 MVP 收敛速度。
- 只有在官方细则、直播口径或评分导向明确偏向这些生态时，才值得补。

## 推荐启动顺序

1. 先读 `docs/2026-03-16-hackathon-requirements-and-directions.md`，确认硬门槛。
2. 再读 `docs/2026-03-16-next-idea-directions.md`，锁定比赛方向。
3. 用 `brainstorming` 收敛一个 3 天内能完成的 MVP 场景。
4. 在新的空目录或单独子目录里运行 `secondme`，或拆分使用 `secondme-init` / `secondme-prd` / `secondme-nextjs`。
5. 用 `secondme-reference` 校验 OAuth 和 API 接入是否贴近官方规范。
6. 用 `frontend-design` 打磨首屏、主交互和结果页。
7. 用 `playwright` 与 `test-runner` 只验证最关键的 demo 路径。

## 什么时候再加 OpenSpace / Superpowers

只有满足下面任一条件，再把它们加入候选：

- 官方直播或文档明确把相关生态接入当成加分点。
- 它们能直接提升 OAuth 用户增长或 demo 说服力。
- 当前 MVP 已经跑通，团队还有富余时间做加分项。

如果没有满足这些条件，默认继续按现有 skill 栈推进。
