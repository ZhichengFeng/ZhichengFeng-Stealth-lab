# 静态网站维护说明

## 发布物与源工程

这个仓库存放 GitHub Pages 发布目录。主应用的 `index.html`、`demo/index.html` 和带哈希名称的 `assets/` 文件由源工程构建生成；这里没有 `package.json`，不能在本仓库直接运行 `npm run build`。

`aerorepair-scan/` 与 `repair-workflow/` 是可以直接维护的原生静态模块。它们通过 `assets/aerorepair-entry.js` 和 `assets/repair-workflow-entry.js` 挂接到主应用，两个入口脚本应随发布保留。

主实验室另有可直接阅读和维护的发布层文件，同时由首页与演示入口加载：

| 文件 | 职责 |
| --- | --- |
| `assets/site-polish.css` | 首页布局、工作台卡片、控件可读性、焦点样式和响应式适配 |
| `assets/site-enhancements.js` | 客户端初始化后的概念图、模块入口、导航辅助标签和跳转到主要内容 |
| `assets/site-mobile-workspace.css` | 手机和平板实验面板的自然滚动布局，以及时间轴定位 |
| `assets/timeline-navigation.js` | 使用原有时间轴与阶段数据，修正阶段跳转的时间舍入误差 |

这层增强复用现有图像和交互入口，不改写科学数据。重新生成主应用时，应重新接入这些文件，并检查它们依赖的页面类名和交互入口是否仍然匹配。时间轴适配脚本导入了带哈希名称的模块：重新构建时须更新其导入，或在源工程 `TimelineDock.tsx` 中把阶段跳转目标设为阶段起点之后 1 毫秒，再移除此适配脚本。`site-mobile-workspace.css` 应在 `site-polish.css` 之后加载。README 的桌面截图保存在 `docs/screenshots/home-desktop.png`；首页发生明显变化时同步更新。

## 选择修改位置

- 主实验室的科学计算、状态和场景行为：在完整源工程修改并重新构建，保留数据来源标记。
- 主实验室的局部视觉样式：优先使用可阅读的独立样式文件。修改后检查首页和 `/demo/`，避免直接编辑压缩后的 JavaScript。
- 扫描与修复模块：直接维护各目录中的 HTML、CSS、JavaScript；数据生成脚本和静态依赖一起保留。
- 导航、标题和分享信息：检查所有四个入口，保证相对路径、返回主页链接以及页面描述一致。

## 从源工程重新构建时

1. 确认源工程的修改和构建输出属于同一次发布。
2. 以 `/ZhichengFeng-Stealth-lab/` 为公共基础路径构建。当前主应用所有绝对资源地址都使用这个项目路径。
3. 把构建后的 HTML 与对应哈希资源作为一组更新，避免 HTML 指向不存在的 chunk。
4. 同时保留两项原生模块、入口脚本、独立样式、数据、参考资产、README、LICENSE、维护工具和 `.nojekyll`。源工程的客户端输出未必包含后来增加的模块。
5. 在带项目路径的本地静态服务器上完成检查，再发布。

不要用另一套托管平台的根路径构建产物直接替换 GitHub Pages 发布目录。本仓库的 `_headers` 文件属于其他静态托管平台的配置格式，GitHub Pages 不读取它来设置响应头。

## 发布前检查

在项目父目录运行本地服务器：

```powershell
python -m http.server 3000 --bind 127.0.0.1
```

在仓库根目录运行：

```powershell
python tools/check_site.py
```

检查脚本仅使用 Python 3.10+ 标准库，不联网、不改写文件；验证页面中的本地链接与资源、CSS 引用、可静态识别的 JavaScript 相对文件路径，以及 manifest 中的资源路径、大小和 SHA-256。JSON / CSV 按 Git 发布文件的 LF 换行校验，兼容 Windows 的 `core.autocrlf` 工作区转换。它不执行 JavaScript、不验证外部链接，也不代替科学数据审核。

随后在浏览器验证：

- 首页、演示、AeroRepair Scan 和 Repair Workflow 均可打开，返回主页正常。
- 自动演示、自由探索、结构/极化切换、图表和修复模块的播放/重置可用。
- 桌面与手机视口无横向溢出；关键操作没有被遮挡，键盘焦点清晰。
- 页面无关键资源 404、JavaScript 异常或 WebGL 初始化失败。
- 合成案例和独立 CST 参考的来源说明与实际显示数据相符。

推送后检查 GitHub Pages 部署结果，再以公开网址复核。Git 提交成功只表示代码已经更新，不代表部署已经完成。
