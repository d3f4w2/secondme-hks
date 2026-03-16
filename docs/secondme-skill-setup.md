# Second Me Skill Setup

## 已安装内容

官方 Windows 安装脚本 `https://reconnect-hackathon.com/api/setup/launch-windows` 最终安装的是：

- `npx skills add Mindverse/Second-Me-Skills --yes`

本项目已经把这个仓库里的开发者 skill 组安装到项目内：

- `.codex/skills/secondme`
- `.codex/skills/secondme-init`
- `.codex/skills/secondme-prd`
- `.codex/skills/secondme-nextjs`
- `.codex/skills/secondme-reference`

源码来源：

- `https://github.com/Mindverse/Second-Me-Skills`

## 安全审查结论

已审查本次安装用到的 5 个 `SKILL.md` 文件和官方安装脚本。

- 风险级别：中低
- 结论：可安装
- 未发现凭证窃取、隐蔽外传、系统级破坏、提权命令、可执行脚本落地
- skill 内容主要是工作流说明，外链仅包含 Second Me 文档、OAuth/API 地址和常规开发命令

需要知道的一点：

- `secondme` / `secondme-nextjs` 本质是“生成项目”的工作流，不是“给现有项目做小幅接入”的增量改造器

## 当前项目怎么被 Codex 发现

本机 Codex 的本地说明显示，原生发现路径是 `~/.agents/skills/`，不是项目里的 `.codex/skills/`。

因此除了项目内副本，我还额外建立了一个本地 junction：

- `C:\Users\24719\.agents\skills\hks-secondme -> C:\Users\24719\Desktop\hks\.codex\skills`

这样做的效果：

- 项目里保留可提交的 skill 文件
- Codex 重启后可以从 `~/.agents/skills/` 发现这组 skills

依赖说明：

- `secondme-nextjs` 依赖 `frontend-design`
- 本机已存在 `C:\Users\24719\.agents\skills\frontend-design-3-0.1.0`，所以依赖已满足

## 在这个仓库里怎么用

这个仓库已经是一个现成的 Next.js + Second Me OAuth 项目，所以建议这样使用：

### 推荐

- `secondme-reference`
  - 用来查 OAuth、token 交换、API 响应格式、shades 等参考信息
  - 适合当前仓库
- `secondme-prd`
  - 用来整理产品需求或补全新功能方向
  - 不会默认重建整个项目

### 谨慎使用

- `secondme-init`
  - 会生成 `.secondme/state.json` 和 `CLAUDE.md`
  - 如果你就是想把这个仓库重新纳入 Second Me skill 工作流，可以用
  - 如果你不想新增这些配置文件，就不要在当前仓库直接运行

### 不建议在当前仓库直接运行

- `secondme`
- `secondme-nextjs`

原因：

- 这两个 skill 明确假设当前目录将直接用于初始化或生成 Next.js 项目
- 当前仓库已经有 `src/`、`package.json`、现成 OAuth 代码和文档
- 在现有仓库里跑脚手架式 skill，容易与现有结构冲突

如果你要新开一个 Second Me 项目，再在空目录里用这两个：

- `secondme`
- `secondme --quick`
- `secondme-init`
- `secondme-prd`
- `secondme-nextjs`

## 验证方式

### 已完成的本地验证

- 项目内已存在 5 个 skill 目录和对应 `SKILL.md`
- `~/.agents/skills/hks-secondme` junction 已创建成功
- `frontend-design` 依赖在本机已存在

### 你现在要做的验证

1. 重启 Codex，并在这个项目目录重新打开会话
2. 用显式触发语测试

推荐测试语：

- `use secondme-reference to review the Second Me OAuth token exchange flow in this repo`
- `用 secondme-reference 检查这个项目里的 Second Me OAuth 接入有没有偏离官方文档`

如果要验证脚手架类 skill 是否能被识别，只建议在空目录测试：

- `use secondme --quick to scaffold a new Second Me Next.js app here`

### 预期结果

- Codex 能识别 `secondme-reference`、`secondme-prd` 等名字
- 在当前仓库里，`secondme-reference` 应优先用于查文档和接口约束
- 不应把 `secondme` / `secondme-nextjs` 当成对现有项目的安全小修工具

