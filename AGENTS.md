# 规则

- AI 保留 OpenAI Responses、OpenAI 兼容 Chat Completions 和 Anthropic 协议。

# utools 描述
- 该项目只在 utools 发布, 无需关注其他平台
- utools 内核版本是旧版的, 注意样式编写,例如: uTools 旧内核对 hsl(var(--xxx)/alpha) 支持不好，会退化成 整块实色红，文字又是同色 

# 验证

- 任何代码修改完成后，默认立即执行 `bun run build`；未通过不得宣称完成。
- 默认不要用浏览器、截图或页面交互做验证。
- 仅当用户明确要求视觉验收、交互复现或 UI 对比时才使用浏览器，并统一读取全局 `browser-use` skill。
