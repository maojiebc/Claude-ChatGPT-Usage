# Claude-ChatGPT-Usage

> Claude.ai 完整中文汉化，以及 Claude、Fable 5、ChatGPT/Codex 订阅额度显示。

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Userscript](https://img.shields.io/badge/Tampermonkey-Userscript-black?logo=tampermonkey)](https://raw.githubusercontent.com/maojiebc/Claude-ChatGPT-Usage/main/claude-chatgpt-usage.user.js)

## 功能

- **Claude.ai 完整中文汉化**：保留原项目 10,000+ 行翻译词条，覆盖 Claude Code、Artifacts、Projects、Cowork、Claude Design 等界面。
- **Claude 额度显示**：显示 5 小时窗口、7 日总额度和 Fable 5 独立周额度。
- **新旧接口兼容**：同时解析新版 `limits[]`、旧版 `seven_day_fable`、`fable_weekly` 等字段。
- **ChatGPT/Codex 额度显示**：与 ChatGPT 网页端一致，仅显示套餐共享的每周使用限额。
- **重置时间跟踪**：显示额度重置日期和剩余倒计时。
- **可拖动面板**：支持桌面端和移动端触控拖动，位置分别保存在 Claude.ai 与 ChatGPT 域名下。
- **明暗主题适配**：自动跟随页面或系统主题。

## 安装

### Tampermonkey / Violentmonkey

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)。
2. 点击安装：[claude-chatgpt-usage.user.js](https://raw.githubusercontent.com/maojiebc/Claude-ChatGPT-Usage/main/claude-chatgpt-usage.user.js)。
3. 刷新 [Claude.ai](https://claude.ai/) 或 [ChatGPT](https://chatgpt.com/)。

目前仅通过 GitHub 发布和更新，不在 Greasy Fork 上架。

## 显示内容

### Claude.ai

- 5 小时滚动窗口
- 7 日总额度
- Fable 5 独立周额度（账号具备该额度时显示）
- Claude.ai 中文界面与 Claude Design 中文翻译

### ChatGPT

- 每周使用限额、剩余百分比和重置时间
- ChatGPT 套餐类型

> ChatGPT 接口中的 Spark 等内部模型计量项不会作为用户额度显示；普通 Chat 对话也不计入此处用量。

## 隐私与安全

- 脚本只向 `claude.ai`、`chatgpt.com` 及声明的只读 GitHub 资源发起请求。
- 额度接口使用浏览器当前登录态，不读取本机 Claude Code 或 Codex 凭据文件。
- 不上传 Cookie、访问令牌、对话内容或使用统计。
- 翻译资源通过固定版本标签和 SHA-256 SRI 校验加载，资源内容变化时浏览器会拒绝执行。

## 项目结构

```text
Claude-ChatGPT-Usage/
├── claude-chatgpt-usage.user.js  # 主用户脚本
├── claude2cn-translations.user.js # Claude 翻译词典
├── claude2cn-design.user.js       # Claude Design 翻译词典
├── en.json                        # 原始英文词条
├── en2cn.json                     # 英中翻译映射
├── tests/                         # 用量解析与页面烟雾测试
└── CHANGELOG.md
```

## 开发与验证

```bash
npm test
node --check claude-chatgpt-usage.user.js
```

## 来源与授权

本项目基于 [jyking/claude2cn](https://github.com/jyking/claude2cn) 二次开发，保留原作者 `jyking` 的版权声明和完整 MIT 许可文本。

新增的 ChatGPT/Codex、Fable 5 额度兼容和相关测试由 `maojiebc` 维护。详见 [LICENSE](LICENSE) 与 [CHANGELOG.md](CHANGELOG.md)。
