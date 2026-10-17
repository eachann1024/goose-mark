# 鹅的书签 · AI 创建 动画

Remotion 单 Composition：1080×1080 @ 60fps，1950 帧（32.5s），不循环，尾帧品牌卡定格 150 帧。

## 命令

```bash
bun install
npm run halftone   # 生成 1-bit 半调点阵鹅（public/halftone）
npm run audio      # 代码合成音效床（public/audio/bed.wav）
npm run studio     # 预览
npm run render     # 出片 out/goose-ai.mp4（CRF 18 / yuv420p / +faststart）
npm run build      # 以上三步串起来
```

## 结构

| 文件 | 作用 |
| --- | --- |
| `src/theme.ts` | 画布尺寸、7 段底色、字体三轨、镜头表 |
| `src/lib/anim.ts` | 弹簧与贝塞尔曲线常量 |
| `src/parts/Type.tsx` | 双轨制标题（无衬线 700 + 衬线 Italic）、等宽注释 |
| `src/parts/ui.tsx` | 卡片、勾选、印章、开关 |
| `src/parts/deco.tsx` | 装饰层：点阵底纹、定位括号、半调星、划线、导轨、印版色标 |
| `src/shots/S1…S8.tsx` | 八个镜头 |
| `scripts/make-halftone.mjs` | 剪影遮罩 + 解析明暗 → 网点圆点 → PNG |
| `scripts/make-audio.mjs` | BPM 120 的 WAV 合成（正弦主音 + 三角波贝斯 + 白噪声 hi-hat） |

## 镜头表

| # | 帧区间 | 底色 | 主运动 | 标题 |
| --- | --- | --- | --- | --- |
| 1 | 0–420 | 燕麦 | 升起 | 塞一段乱文 / *网址自己浮上来* |
| 2 | 420–690 | 青瓷 | 飞入 | 它先读懂 / *再替你动手* |
| 3 | 690–930 | 雾蓝 | 填充 | 图标、正文、描述 / *一次装齐* |
| 4 | 930–1200 | 陶土 | 滚动 | 原文是英文 / *读的是中文* |
| 5 | 1200–1410 | 藕紫 | 塌缩 | 标题不超 20 字 / *描述不超 150 字* |
| 6 | 1410–1620 | 芽绿 | 砸落 | 位置不对 / *就自己新建* |
| 7 | 1620–1800 | 黑场 | 硬切 | 给它一段话 / *它给你一张卡* |
| 8 | 1800–1950 | 近白 | 定格 | 品牌卡 |

半调网点 3–4px 按目标像素 1:1 输出，渲染时只做整数位移，不缩放，因此不会起摩尔纹。
