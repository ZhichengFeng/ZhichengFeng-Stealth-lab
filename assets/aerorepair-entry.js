(() => {
  "use strict";
  const repoBase = "/ZhichengFeng-Stealth-lab/";
  const moduleHref = `${repoBase}aerorepair-scan/`;

  function icon() {
    return `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 14c3-5 7-8 14-9-2 2-3 4-3 7 2 0 3 1 4 3-5-1-9 0-13 4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="16.8" cy="5.2" r="1.7" fill="currentColor"/></svg>`;
  }

  function createLink(className, label) {
    const link = document.createElement("a");
    link.href = moduleHref;
    link.className = className;
    link.dataset.aerorepairEntry = "true";
    link.setAttribute("aria-label", "打开 AeroRepair Scan 原位近场评估模块");
    link.innerHTML = `${icon()}<span>${label}</span>`;
    return link;
  }

  function inject() {
    const nav = document.querySelector(".top-actions");
    if (nav && !nav.querySelector("[data-aerorepair-entry]")) {
      nav.append(createLink("aerorepair-nav", "AeroRepair"));
    }
    const actions = document.querySelector(".intro-actions");
    if (actions && !actions.querySelector("[data-aerorepair-entry]")) {
      actions.append(createLink("aerorepair-intro-action", "AeroRepair Scan"));
    }
  }

  const style = document.createElement("style");
  style.dataset.aerorepairEntryStyle = "true";
  style.textContent = `
    .top-actions .aerorepair-nav {
      height:32px;padding:0 11px;display:flex;align-items:center;gap:7px;
      border:1px solid rgba(124,216,224,.38);border-radius:2px;color:#bfeef1;
      background:rgba(35,95,105,.28);font-size:10px;letter-spacing:.05em;text-decoration:none;
      transition:border-color .16s,color .16s,background .16s,transform .16s
    }
    .top-actions .aerorepair-nav:hover,.top-actions .aerorepair-nav:focus-visible {
      color:#e0fbfc;border-color:rgba(147,230,236,.72);background:rgba(43,123,134,.42);transform:translateY(-1px)
    }
    .aerorepair-intro-action {
      min-height:42px;padding:0 15px;display:inline-flex;align-items:center;justify-content:center;gap:9px;
      border:1px solid rgba(126,217,224,.45);border-radius:2px;color:#c8f5f6;background:rgba(26,78,87,.42);
      font-size:11px;letter-spacing:.04em;text-decoration:none;transition:.18s ease
    }
    .aerorepair-intro-action:hover,.aerorepair-intro-action:focus-visible {background:rgba(42,113,124,.55);transform:translateY(-1px)}
    @media(max-width:1180px){.top-actions .aerorepair-nav{width:35px;padding:0;justify-content:center;font-size:0}.top-actions .aerorepair-nav span{display:none}}
    @media(max-width:720px){.aerorepair-intro-action{width:100%}}
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
    if (!document.querySelector("[data-aerorepair-entry-style]")) document.head.append(style);
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
