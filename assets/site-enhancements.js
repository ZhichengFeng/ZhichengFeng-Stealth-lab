/* Progressive enhancements for the published site; no changes to scientific data. */
(() => {
  'use strict';
  const base = new URL('../', document.currentScript.src);
  const href = path => new URL(path, base).href;
  let scheduled = false;
  let mountAttempts = 0;

  function enhance() {
    scheduled = false;
    const shell = document.querySelector('.lab-shell');
    if (!shell) return;
    for (const control of document.querySelectorAll('.top-actions button, .top-actions a')) {
      if (!control.title) control.title = control.textContent.trim();
      if (!control.hasAttribute('aria-label')) control.setAttribute('aria-label', control.textContent.trim());
    }
    const intro = document.querySelector('.intro-overlay');
    if (intro && !intro.querySelector('.site-modules')) {
      const figure = document.createElement('figure');
      figure.className = 'site-visual';
      figure.innerHTML = `<div class="site-visual-heading"><span>MICRO → MACRO</span><span>跨尺度链路 · 概念示意</span></div>
        <img src="${href('og-agent.png')}" width="1731" height="909" alt="项目概念图：从 TPMS 胞元、等效材料和机翼前缘，连接到飞机与雷达散射" decoding="async">
        <figcaption><span><strong>08 阶段</strong>连续三维演示</span><span><strong>03 结构</strong>Gyroid · Diamond · Primitive</span><span><strong>TE / TM</strong>双极化探索</span></figcaption>`;
      const modules = document.createElement('section');
      modules.className = 'site-modules';
      modules.setAttribute('aria-labelledby', 'site-modules-title');
      modules.innerHTML = `<div class="site-section-heading"><h2 id="site-modules-title">继续探索研究工作台</h2><span>DESIGN / SCAN / REPAIR</span></div>
        <div class="site-module-grid">
          <button type="button" class="site-module-card" data-site-absorbevo><span>DESIGN INTELLIGENCE</span><span class="site-card-arrow" aria-hidden="true">↗</span><strong>AbsorbEvo 逆向设计</strong><p>从物理诊断到候选方案，以验证证据驱动吸波结构的下一步改进。</p><span class="site-card-link">进入设计工作台 →</span></button>
          <a class="site-module-card" href="${href('aerorepair-scan/')}"><span>MODULE 09 / IN-SITU SCAN</span><span class="site-card-arrow" aria-hidden="true">↗</span><strong>AeroRepair 原位扫描</strong><p>探索双极化近场扫描、缺陷定位与修复区域的质量评估流程。</p><span class="site-card-link">打开交互扫描 →</span></a>
          <a class="site-module-card" href="${href('repair-workflow/')}"><span>MODULE 10 / REPAIR WORKFLOW</span><span class="site-card-arrow" aria-hidden="true">↗</span><strong>损伤检测与修复</strong><p>连接损伤识别、修复方案与复检，查看完整的分步工作流。</p><span class="site-card-link">查看修复流程 →</span></a>
        </div><p class="site-data-note"><span>数据说明：完整跨尺度链路与检测修复模块采用合成演示数据；CST 参考数据单独标识。</span><a href="https://github.com/ZhichengFeng/ZhichengFeng-Stealth-lab">GitHub · 项目与数据说明 ↗</a></p>`;
      modules.querySelector('[data-site-absorbevo]').addEventListener('click', () => {
        document.querySelector('[data-testid="absorbevo-mode"]')?.click();
      });
      intro.append(figure, modules);
      intro.classList.add('site-intro-ready');
    }
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhance);
  }
  function mount() {
    // The canvas is mounted by React after hydration, avoiding edits to its SSR tree.
    if (!document.querySelector('.scene-viewport canvas')) {
      // Leave the original page intact if 3D initialization fails.
      if (++mountAttempts < 200) setTimeout(mount, 150);
      return;
    }
    document.querySelector('.lab-shell').id = 'site-main';
    const skip = document.createElement('a');
    skip.className = 'site-skip-link';
    skip.href = '#site-main';
    skip.textContent = '跳到主要内容';
    skip.addEventListener('click', event => {
      event.preventDefault();
      const target = ['.absorbevo-workspace', '.project-overview', '.intro-overlay', '.control-panel']
        .map(selector => document.querySelector(selector)).find(element => element && element.getClientRects().length);
      if (target) {
        target.tabIndex = -1;
        target.focus();
        target.scrollIntoView({block: 'start'});
      }
    });
    document.body.prepend(skip);
    enhance();
    new MutationObserver(schedule).observe(document.querySelector('.lab-shell'), {childList: true, subtree: true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once: true});
  else mount();
})();
