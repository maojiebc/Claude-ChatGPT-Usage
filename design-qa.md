# 原设计稿色系还原 QA（v1.5.6）

## 验证范围

- 源视觉真值：`/Users/majia/Downloads/额度插件/claude-usage-widget-reference.png`。
- 配套设计变量：`/Users/majia/Downloads/额度插件/claude-usage-widget-design-spec.md` 第 7.1、7.2 节。
- 实现截图：`qa/color-audit/13-reference-palette-compact-v1.5.6.jpg`、`14-reference-palette-expanded-v1.5.6.jpg`、`15-reference-palette-dark-v1.5.6.jpg`、`16-reference-palette-danger-v1.5.6.jpg`、`17-chatgpt-reference-palette-v1.5.6.jpg`。
- 视口：1280 × 720。
- 状态：Claude 收起态、展开态、低额度、浅色/深色主题，以及 ChatGPT 展开态。

## 对照证据

- 全视图：参考图与 `14-reference-palette-expanded-v1.5.6.jpg` 已在同一比较输入中检查。
- 聚焦区域：本次只修改健康度色值；参考图与配套规范提供了精确十六进制变量，组件在 304px 实际宽度下清晰可读，因此无需额外裁切放大。
- 色值映射：`#18B96B` 鲜绿、`#4285F4` 明蓝、`#FF6B3D` 珊瑚橙、`#EF493D` 告警红。

## Findings

- 未发现仍需处理的 P0、P1 或 P2 问题。
- 字体与排版：系统字体、字号、字重、数字等宽和截断规则均未改变。
- 间距与布局：收起态双列对齐、展开态间距、圆角和阴影均未改变，无溢出或跳动。
- 颜色与视觉变量：三种主色与源规范完全一致；柔和轨道由对应 RGB 以 14% 透明度生成。
- 图像与图标：继续使用现有透明 PNG 图标资产，未生成或替换任何可见资产。
- 文案：额度名称、百分比、倒计时与重置时间未改变。
- 交互：收起/展开、场景切换、主题切换及 ChatGPT 共享渲染正常。
- 控制台：无 error 或 warning。
- 无障碍限制：百分比仍有明确数字文本，颜色不是唯一信息通道；本次按用户指定源色忠实还原，不宣称完成独立 WCAG 合规审计。

## 比较历史

1. 初始 P2：v1.5.5 使用深翡翠、草绿和深橙，色彩偏厚、偏土，与现有鲜亮图标和原设计稿气质不一致。
2. 修复：从参考图配套规范提取原始色值，并保留既有 `80 / 60 / 40` 分档阈值。
3. 修复后证据：浅色与暗色 Claude 均呈现鲜绿 / 明蓝 / 珊瑚橙；低额度进入告警红；ChatGPT 的 66% 同步为明蓝。

## Implementation Checklist

- [x] Claude 与 ChatGPT 共用新的原稿色系。
- [x] 百分比、进度条和柔和轨道同步更新。
- [x] 80、79、60、59、46、39、0 等边界值有自动化测试。
- [x] 收起态、展开态、低额度、深色主题和 ChatGPT 完成浏览器视觉检查。
- [x] 布局、图标、数据口径与交互保持不变。

final result: passed
