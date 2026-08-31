/* AI Stealth Lab · Module 10 入口注入：损伤检测与修复工作流
   仿照 aerorepair-entry.js：在顶栏与首页操作区追加入口链接。 */
(() => {
  "use strict";
  const repoBase = "/ZhichengFeng-Stealth-lab/";
  const moduleHref = `${repoBase}repair-workflow/`;

  function icon() {
    return `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  function createLink(className, label) {
    const link = document.createElement("a");
    link.href = moduleHref;
    link.className = className;
    link.dataset.repairWorkflowEntry = "true";
    link.setAttribute("aria-label", "打开损伤检测与修复工作流模块");
    link.innerHTML = `${icon()}<span>${label}</span>`;
    return link;
  }

  function inject() {
    const nav = document.querySelector(".top-actions");
    if (nav && !nav.querySelector("[data-repair-workflow-entry]")) {
      nav.append(createLink("repairworkflow-nav", "修复工作流"));
    }
    const actions = document.querySelector(".intro-actions");
    if (actions && !actions.querySelector("[data-repair-workflow-entry]")) {
      actions.append(createLink("repairworkflow-intro-action", "损伤检测与修复"));
    }
  }

  const style = document.createElement("style");
  style.dataset.repairWorkflowEntryStyle = "true";
  style.textContent = `
    .top-actions .repairworkflow-nav {
      height:32px;padding:0 11px;display:flex;align-items:center;gap:7px;
      border:1px solid rgba(233,196,156,.4);border-radius:2px;color:#ffe0bd;
      background:rgba(96,66,30,.28);font-size:10px;letter-spacing:.05em;text-decoration:none;
      transition:border-color .16s,color .16s,background .16s,transform .16s
    }
    .top-actions .repairworkflow-nav:hover,.top-actions .repairworkflow-nav:focus-visible {
      color:#ffefd8;border-color:rgba(255,212,175,.7);background:rgba(120,82,36,.42);transform:translateY(-1px)
    }
    .repairworkflow-intro-action {
      min-height:42px;padding:0 15px;display:inline-flex;align-items:center;justify-content:center;gap:9px;
      border:1px solid rgba(233,196,156,.45);border-radius:2px;color:#ffe4c2;background:rgba(88,60,28,.42);
      font-size:11px;letter-spacing:.04em;text-decoration:none;transition:.18s ease
    }
    .repairworkflow-intro-action:hover,.repairworkflow-intro-action:focus-visible {background:rgba(122,84,40,.55);transform:translateY(-1px)}
    @media(max-width:940px){.top-actions .repairworkflow-nav{width:35px;padding:0;justify-content:center;font-size:0}.top-actions .repairworkflow-nav span{display:none}}
    @media(max-width:720px){.repairworkflow-intro-action{width:100%}}
  `;
  const waitStartedAt = Date.now();
  let mounted = false;

  function mountAfterHydration() {
    if (mounted) return;
    const sceneReady = document.querySelector(".scene-viewport canvas");
    const safetyTimeoutReached = Date.now() - waitStartedAt > 6000;
    if (!sceneReady && !safetyTimeoutReached) {
      window.setTimeout(mountAfterHydration, 120);
      return;
    }
    mounted = true;
    if (!document.querySelector("[data-repair-workflow-entry-style]")) document.head.append(style);
    inject();
    const observer = new MutationObserver(inject);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountAfterHydration, { once: true });
  } else {
    mountAfterHydration();
  }
})();
