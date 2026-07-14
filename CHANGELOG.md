# Changelog

## 1.0.1 - 2026-07-14

- 重构 ChatGPT/Codex 展开面板，将模型名、窗口类型和额度周期分层显示。
- 长模型名改为单行省略，完整信息保留在悬停提示中，避免孤字换行和横向溢出。
- ChatGPT 主额度、次额度使用一致的标题与周期徽标，并规范 `Pro Lite` 等套餐名称。

## 1.0.0 - 2026-07-14

- 基于 `jyking/claude2cn` 的 MIT 授权代码建立独立维护版本。
- 保留 Claude.ai 完整中文汉化与 Claude Design 翻译资源。
- 增加 Claude Fable 5 独立周额度显示。
- 兼容新版 `limits[]`、旧版 Fable 字段和多种重置时间格式。
- 增加 ChatGPT/Codex 主窗口、次窗口及额外模型额度显示。
- 增加解析回归测试与 ChatGPT 页面烟雾测试。
