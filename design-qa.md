# 用量组件图标设计 QA

## 验证范围

- 最新基线：`v1.5.1`（ChatGPT 收起态新增重置卡次数）。
- 源视觉：`assets/claude-usage-icons/source-sheet-v2.png`。
- 新图标源图：`assets/claude-usage-icons/reset-card-v1-source.png`。
- 最终透明资产：`assets/claude-usage-icons/reset-card.png`，64 × 64 RGBA PNG。
- 实现预览：`tests/preview/harness.html`，加载真实资源脚本和真实 userscript，仅 mock 用量接口。
- 视口：1280 × 720。
- 状态：ChatGPT 收起态、展开态、浅色主题、深色主题。

## 对照证据

- 收起态实现：`qa/chatgpt-reset-card-v1.5.2.png`。
- 展开态浅色实现：`qa/chatgpt-reset-card-expanded-v1.5.2.png`。
- 展开态深色实现：`qa/chatgpt-reset-card-dark-v1.5.2.png`。
- 源图与实现聚焦对照：`qa/chatgpt-reset-card-comparison-v1.5.2.png`。

完整画面用于检查浮窗位置、卡片比例与信息层级；聚焦对照将最终图标和浅色、深色展开卡放在同一画面，检查票券轮廓、紫色层次、缩放清晰度与文字基线。收起态另行检查图标与 `×4` 的两列对齐。

## Findings

- 未发现 P0、P1 或 P2 问题。
- 字体与排版：沿用 `v1.5.1` 的共享字体、字号和字重，重置卡文案无换行或截断。
- 间距与节奏：收起态图标与 `×N` 对齐；展开态 24px 图标容器与标题、次数徽标保持原有网格。
- 色彩：紫色票券在浅色和深色主题下均清晰，仍与重置卡语义色一致。
- 图片质量：透明边缘无绿色残留、白边或明显压缩；18px 与 24px 两种显示尺寸均可辨识。
- 文案：`重置卡`、`N 次可用`、`最近到期` 内容与 `v1.5.1` 一致。
- 交互：点击收起卡可展开；主题切换后图标保持清晰；重置卡数量与到期时间正常显示。
- 控制台：无 error 或 warning。

## 比较历史

1. `v1.5.1` 的收起态和展开态仍使用旧线性票券 SVG，与已生成的 Claude 图标语言不一致，判定为 P2。
2. 生成紫色“票券 + 回转箭头”资产，完成抠图、透明边缘处理与 64px 输出；收起态和展开态统一改用该资产。
3. 在相同 1280 × 720 视口复核浅色、深色和两种展开状态，P2 已消除，未出现新的 P0/P1/P2。

## Implementation Checklist

- [x] 新图标加入带 SHA-256 校验的资源脚本。
- [x] 收起态重置卡行替换旧票券 SVG。
- [x] 展开态重置卡区块替换旧票券 SVG。
- [x] 浅色、深色、收起、展开状态通过视觉检查。
- [x] 自动化测试和控制台检查通过。

final result: passed
