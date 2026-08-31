# Module 10 · Repair Workflow 损伤检测与修复工作流

隐身飞机蜂窝夹层结构「损伤 → 检测 → 修复 → 再检测」闭环的一页式交互演示。

## 快速开始

本模块是纯静态页面，随仓库 GitHub Pages 直接部署：

```text
https://<your-account>.github.io/ZhichengFeng-Stealth-lab/repair-workflow/
```

本地预览（仓库根目录）：

```bash
npx serve .            # 或 python -m http.server
# 打开 http://localhost:3000/repair-workflow/
```

> Three.js 已本地化到 `vendor/three.module.js`，断网也能运行；
> 但页面需通过 http(s) 访问（ES Module 与 fetch 不支持 file:// 直开）。

## 模块组成

| 区块 | 内容 | 技术 |
|---|---|---|
| Damage | 蜂窝夹层剖切模型，完好/冲击/穿孔/修复后四状态切换 | Three.js（局部，懒加载） |
| Sense | 超声 A-scan + Hilbert 包络，6 测点扫描动画与逐点判定 | Canvas 2D + SVG |
| Probe | 波导探头光栅扫描、S11 曲线（对照完好参考）、近场响应热图、近远场变换概念流程 | Canvas 2D + SVG |
| Repair | 挖补（scarf）修复六步剖面分步动画，完成后回到「修复后」状态闭环 | SVG |

四个模块共享全局损伤状态（Damage 区切换后，Sense/Probe 的数据与标题联动）。

## 文件结构

```text
repair-workflow/
├── index.html                      # 页面骨架（流程条 + 4 模块）
├── styles.css                      # 视觉样式（对齐 AeroRepair Scan 语言）
├── app.js                          # 全部交互逻辑（原生 JS，无构建步骤）
├── assets/
│   └── repair-scarf-configuration.webp   # 前缘挖补修复构型参考图（18 KB）
├── data/
│   ├── damage-states.json          # 四种损伤状态配置
│   ├── ultrasonic-demo.json        # A-scan + Hilbert 包络（4 状态 × 6 测点）
│   ├── electromagnetic-demo.json   # S11 曲线 + 近场响应图（4 状态 × 3 测点）
│   └── repair-steps.json           # 六步修复工艺配置
├── tools/
│   ├── generate-demo-data.mjs      # 演示数据生成器（确定性，可复现）
│   └── png-to-webp.mjs             # 参考图压缩工具
└── vendor/
    └── three.module.js             # Three.js r160（本地化离线依赖）
```

## 数据说明（重要）

`data/` 下全部为**合成演示数据**，由 `tools/generate-demo-data.mjs` 以固定种子确定性生成，
仅用于交互演示，不代表真实测量或仿真结果。重新生成：

```bash
node repair-workflow/tools/generate-demo-data.mjs
```

数据已按物理直觉构造区分度：穿孔区底面回波消失、冲击区出现附加回波、修复后界面弱回波且底面回波恢复。

## 主页集成

主页通过 `assets/repair-workflow-entry.js`（已在 `index.html` 中 defer 引入）在顶栏与首页
操作区注入「修复工作流」入口链接，实现方式与 `aerorepair-entry.js` 一致，不影响主应用水合。
