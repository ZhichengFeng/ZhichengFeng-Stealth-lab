/* ============================================================
   AI Stealth Lab · Module 10 · Damage Detection & Repair Workflow
   原生 JS：Three.js（仅 Damage 模块）+ Canvas 2D 图表 + SVG 示意
   数据：./data/*.json（演示数据，离线可用）
   ============================================================ */
(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const STATE_LABEL = {
    intact: "完好 · Intact",
    impact: "冲击损伤 · Impact",
    perforation: "穿孔损伤 · Perforation",
    repaired: "修复后 · Repaired"
  };

  const DATA = { damage: null, us: null, em: null, repair: null };
  let currentState = "intact";

  /* ============================================================
     1) 数据加载（含内联回退，保证 file:// 或缺文件时仍可浏览）
     ============================================================ */
  const FALLBACK_US = {
    time_us: Array.from({ length: 256 }, (_, i) => +(i * 0.04).toFixed(2)),
    states: {
      intact: { points: [{ id: "P1", x_mm: 10, status: "intact", raw: [0], envelope: [0] }] },
      impact: { points: [{ id: "P1", x_mm: 10, status: "damage", raw: [0], envelope: [0] }] },
      perforation: { points: [{ id: "P1", x_mm: 10, status: "damage", raw: [0], envelope: [0] }] },
      repaired: { points: [{ id: "P1", x_mm: 10, status: "intact", raw: [0], envelope: [0] }] }
    }
  };

  async function loadJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(url + " " + r.status);
    return r.json();
  }

  async function loadAll() {
    try { DATA.damage = await loadJSON("./data/damage-states.json"); } catch (e) { DATA.damage = { states: [] }; }
    try { DATA.us = await loadJSON("./data/ultrasonic-demo.json"); } catch (e) { DATA.us = FALLBACK_US; }
    try { DATA.em = await loadJSON("./data/electromagnetic-demo.json"); } catch (e) { DATA.em = null; }
    try { DATA.repair = await loadJSON("./data/repair-steps.json"); } catch (e) { DATA.repair = { steps: [] }; }
  }

  /* ============================================================
     2) 全局状态联动：Damage 选择 → 页面标签 + Sense/Probe 标题
     ============================================================ */
  function setDamageState(state) {
    currentState = state;
    const label = STATE_LABEL[state] || state;
    const gl = $("#global-state-label");
    if (gl) gl.textContent = label;
    const badge = $("#damage-badge");
    if (badge) badge.textContent = label;
    // 状态切换按钮高亮
    $$(".state-switch button").forEach((b) =>
      b.setAttribute("aria-selected", String(b.dataset.state === state))
    );
    // 说明文字
    const st = (DATA.damage.states || []).find((s) => s.id === state);
    const desc = $("#damage-desc");
    if (desc && st) desc.textContent = st.description_zh || "";
    // 三维场景
    DamageViewer.setState(state);
    // 检测模块刷新标题/状态
    USModule.refresh();
    EMModule.refresh();
  }

  /* ============================================================
     3) DamageViewer —— Three.js 蜂窝夹层结构（局部剖切示意）
        懒加载 three.module.js（本地 vendor，离线可用）
     ============================================================ */
  const DamageViewer = (() => {
    let THREE = null, renderer = null, scene = null, camera = null, frame = 0;
    let group = null, stateGroups = {};
    let dragging = false, px = 0, py = 0, rx = -0.5, ry = 0.7, dist = 30;
    let inited = false, failed = false;

    const COLORS = {
      skin: 0x8fb4bf, core: 0x57707c, coreLine: 0xd4eef2,
      damage: 0xd97e4a, patch: 0x86c2ad, patchLine: 0xe8fff4,
      bg: 0x1d3d4b
    };

    function hexCell(r, h, color, opacity = 1) {
      const geo = new THREE.CylinderGeometry(r, r, h, 6, 1, true);
      const mat = new THREE.MeshLambertMaterial({
        color, transparent: opacity < 1, opacity,
        side: THREE.DoubleSide, wireframe: false
      });
      const mesh = new THREE.Mesh(geo, mat);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: COLORS.coreLine, transparent: true, opacity: 0.35 })
      );
      const g = new THREE.Group();
      g.add(mesh); g.add(edges);
      return g;
    }

    function honeycomb(cols, rows, cellR, h, holes = []) {
      const g = new THREE.Group();
      const dx = cellR * 1.78, dy = cellR * 1.56;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = (c - (cols - 1) / 2) * dx + (r % 2 ? dx / 2 : 0);
          const z = (r - (rows - 1) / 2) * dy;
          const isHole = holes.some(([hc, hr, rad]) =>
            Math.hypot(c - hc, r - hr) <= rad
          );
          if (isHole) continue;
          const cell = hexCell(cellR, h, COLORS.core, 0.9);
          cell.position.set(x, 0, z);
          g.add(cell);
        }
      }
      return g;
    }

    function plate(w, d, t, color, opacity = 1) {
      const geo = new THREE.BoxGeometry(w, t, d);
      const mat = new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity });
      return new THREE.Mesh(geo, mat);
    }

    function buildScene() {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(COLORS.bg);
      scene.fog = new THREE.Fog(COLORS.bg, 40, 90);

      camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
      scene.add(new THREE.AmbientLight(0xffffff, 0.92));
      const key = new THREE.DirectionalLight(0xeafcff, 1.35);
      key.position.set(10, 18, 12);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xbfeef2, 0.7);
      rim.position.set(-12, 8, -10);
      scene.add(rim);
      const fill = new THREE.DirectionalLight(0xffffff, 0.35);
      fill.position.set(0, -14, 8);
      scene.add(fill);

      group = new THREE.Group();
      scene.add(group);

      const W = 22, D = 16, skinT = 0.5, coreH = 3.4;

      // ---- 完好（也作为其它状态的底座参考） ----
      function baseSandwich(coreHoles) {
        const g = new THREE.Group();
        const top = plate(W, D, skinT, COLORS.skin, 0.92);
        top.position.y = coreH / 2 + skinT / 2;
        const bot = plate(W, D, skinT, COLORS.skin, 0.92);
        bot.position.y = -coreH / 2 - skinT / 2;
        const core = honeycomb(12, 8, 0.95, coreH, coreHoles);
        // 剖切：只保留 z<0 区域附近完整，前侧切除一角便于观察
        g.add(top, bot, core);
        return g;
      }

      // 完好
      stateGroups.intact = baseSandwich([]);

      // 冲击损伤：上蒙皮局部凹陷 + 芯层局部压溃（用损伤色块表示）
      {
        const g = baseSandwich([]);
        const dent = plate(6, 5, 0.35, COLORS.damage, 0.9);
        dent.position.set(-3, coreH / 2 + skinT / 2 - 0.25, -1);
        dent.rotation.x = 0.06;
        const crush = new THREE.Mesh(
          new THREE.BoxGeometry(5.5, coreH * 0.55, 4.5),
          new THREE.MeshLambertMaterial({ color: COLORS.damage, transparent: true, opacity: 0.85 })
        );
        crush.position.set(-3, -coreH * 0.15, -1);
        const glow = new THREE.PointLight(0xe9a46e, 1.4, 14);
        glow.position.set(-3, coreH / 2 + 2, -1);
        g.add(dent, crush, glow);
        stateGroups.impact = g;
      }

      // 穿孔：贯穿上蒙皮与芯层的孔洞（黑色圆柱 + 损伤环）
      {
        const g = baseSandwich([]);
        const hole = new THREE.Mesh(
          new THREE.CylinderGeometry(1.5, 1.5, coreH + skinT * 2 + 0.4, 24),
          new THREE.MeshBasicMaterial({ color: 0x05090b })
        );
        hole.position.set(0, 0, 0);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(1.7, 0.28, 10, 28),
          new THREE.MeshLambertMaterial({ color: COLORS.damage })
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0, coreH / 2 + skinT / 2, 0);
        const glow = new THREE.PointLight(0xe9a46e, 1.8, 12);
        glow.position.set(0, coreH / 2 + 2.4, 0);
        g.add(hole, ring, glow);
        stateGroups.perforation = g;
      }

      // 修复后：挖补构型 —— 圆形挖补（scarf），与参考构型一致
      {
        const g = baseSandwich([]);
        const topY = coreH / 2 + skinT / 2;      // 上蒙皮中心高度
        const patchMat = (op) => new THREE.MeshLambertMaterial({ color: COLORS.patch, transparent: true, opacity: op });
        // ① 新蜂窝芯替换块：圆形芯塞，嵌入挖除区，与原芯层同高同平面
        const plug = new THREE.Mesh(
          new THREE.CylinderGeometry(2.6, 2.6, coreH, 28),
          patchMat(0.9)
        );
        plug.position.set(0, 0, 0);
        // ② 挖补斜面环：母板挖补成圆形斜面坑（上宽下窄），胶层/搭接沿斜面分布
        const bevel = new THREE.Mesh(
          new THREE.CylinderGeometry(4.3, 2.7, skinT * 2.2, 32, 1, true),
          patchMat(0.5)
        );
        bevel.material.side = THREE.DoubleSide;
        bevel.position.set(0, topY - skinT * 0.9, 0);
        // ③ 挖补修补片：两片圆形补片逐层台阶式嵌入斜面坑内
        //    顶片（最小）与上蒙皮顶面齐平，不外凸
        const p2 = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, skinT, 32), patchMat(0.97));
        p2.position.set(0, topY, 0);
        //    次片（略大、略深）形成圆形台阶搭接
        const p1 = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, skinT, 32), patchMat(0.92));
        p1.position.set(0, topY - skinT, 0);
        // ④ 修补区圆形高亮边线（贴合顶面）
        const edge = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.CylinderGeometry(2.7, 2.7, skinT, 32)),
          new THREE.LineBasicMaterial({ color: COLORS.patchLine })
        );
        edge.position.copy(p2.position);
        g.add(plug, bevel, p1, p2, edge);
        stateGroups.repaired = g;
      }

      Object.values(stateGroups).forEach((g) => { g.visible = false; group.add(g); });
      stateGroups.intact.visible = true;
    }

    function resize() {
      if (!renderer) return;
      const holder = $("#damage-viewer");
      if (!holder) return;
      const w = holder.clientWidth, h = holder.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    function animate() {
      frame = requestAnimationFrame(animate);
      group.rotation.y = ry;
      group.rotation.x = rx;
      const d = dist;
      camera.position.set(
        d * Math.sin(ry + 0.6) * Math.cos(rx * 0.4),
        d * 0.55,
        d * Math.cos(ry + 0.6) * Math.cos(rx * 0.4)
      );
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    }

    function bindEvents() {
      const holder = $("#damage-viewer");
      holder.addEventListener("pointerdown", (e) => {
        dragging = true; px = e.clientX; py = e.clientY;
        holder.setPointerCapture(e.pointerId);
      });
      holder.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        ry += (e.clientX - px) * 0.008;
        rx = clamp(rx + (e.clientY - py) * 0.005, -1.1, 0.4);
        px = e.clientX; py = e.clientY;
      });
      ["pointerup", "pointerleave"].forEach((ev) =>
        holder.addEventListener(ev, () => { dragging = false; })
      );
      holder.addEventListener("wheel", (e) => {
        e.preventDefault();
        dist = clamp(dist + e.deltaY * 0.02, 18, 55);
      }, { passive: false });
      new ResizeObserver(resize).observe(holder);
    }

    async function init() {
      if (inited || failed) return;
      try {
        THREE = await import("./vendor/three.module.js");
        const holder = $("#damage-viewer");
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        holder.innerHTML = "";
        holder.appendChild(renderer.domElement);
        buildScene();
        resize();
        bindEvents();
        animate();
        inited = true;
      } catch (err) {
        failed = true;
        const holder = $("#damage-viewer");
        if (holder) {
          holder.innerHTML =
            '<div style="display:grid;place-items:center;height:100%;color:#66858c;font-size:12px;padding:20px;text-align:center;">' +
            "三维示意加载失败（缺少 vendor/three.module.js）。<br/>不影响其余模块浏览。</div>";
        }
      }
    }

    function setState(state) {
      if (!inited || !stateGroups[state]) return;
      Object.entries(stateGroups).forEach(([k, g]) => { g.visible = k === state; });
    }

    return { init, setState };
  })();

  /* ============================================================
     4) Chart —— Canvas 2D 科学绘图（坐标轴/单位/图例/网格）
     ============================================================ */
  function setupCanvas(canvas, heightCss = 300) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 320;
    canvas.style.height = heightCss + "px";
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(heightCss * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h: heightCss };
  }

  function niceTicks(min, max, count = 5) {
    if (max <= min) max = min + 1;
    const span = max - min;
    const step0 = span / count;
    const mag = 10 ** Math.floor(Math.log10(step0));
    const norm = step0 / mag;
    const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
    const start = Math.ceil(min / step) * step;
    const ticks = [];
    for (let v = start; v <= max + 1e-9; v += step) ticks.push(+v.toFixed(6));
    return ticks;
  }

  function drawChart(canvas, cfg) {
    const { ctx, w, h } = setupCanvas(canvas, cfg.height || 300);
    ctx.clearRect(0, 0, w, h);
    const P = { l: 52, r: 12, t: 48, b: 38 };
    const iw = w - P.l - P.r, ih = h - P.t - P.b;
    const xOf = (x) => P.l + ((x - cfg.x[0]) / (cfg.x[1] - cfg.x[0])) * iw;
    const yOf = (y) => P.t + ih - ((y - cfg.y[0]) / (cfg.y[1] - cfg.y[0])) * ih;

    // 网格 + 坐标轴
    ctx.font = "11px Inter, sans-serif";
    ctx.strokeStyle = "rgba(148,205,214,.14)";
    ctx.fillStyle = "#66858c";
    ctx.lineWidth = 1;
    niceTicks(cfg.x[0], cfg.x[1], 6).forEach((t) => {
      const x = xOf(t);
      ctx.beginPath(); ctx.moveTo(x, P.t); ctx.lineTo(x, P.t + ih); ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillText(String(+t.toFixed(2)), x, P.t + ih + 15);
    });
    niceTicks(cfg.y[0], cfg.y[1], 5).forEach((t) => {
      const y = yOf(t);
      ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(P.l + iw, y); ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillText(String(+t.toFixed(2)), P.l - 7, y + 3);
    });
    // 轴标签
    ctx.fillStyle = "#9bb5ba";
    ctx.textAlign = "center";
    ctx.fillText(cfg.xlabel || "", P.l + iw / 2, h - 6);
    ctx.save();
    ctx.translate(12, P.t + ih / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(cfg.ylabel || "", 0, 0);
    ctx.restore();
    // 标题
    if (cfg.title) {
      ctx.textAlign = "left";
      ctx.fillStyle = "#9bb5ba";
      ctx.font = "11.5px Inter, sans-serif";
      ctx.fillText(cfg.title, P.l, 17);
    }

    // 序列
    cfg.series.forEach((s) => {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.dash ? 1.2 : 1.6;
      ctx.setLineDash(s.dash ? [5, 4] : []);
      ctx.beginPath();
      const xs = s.x, ys = s.y;
      for (let i = 0; i < xs.length; i++) {
        const X = xOf(xs[i]), Y = yOf(clamp(ys[i], cfg.y[0], cfg.y[1]));
        i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
      }
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // 图例
    let lx = P.l + 4;
    const ly = P.t - 14;
    ctx.font = "10.5px Inter, sans-serif";
    cfg.series.forEach((s) => {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.setLineDash(s.dash ? [4, 3] : []);
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 16, ly); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#9bb5ba";
      ctx.textAlign = "left";
      ctx.fillText(s.label, lx + 20, ly + 3);
      lx += 20 + ctx.measureText(s.label).width + 18;
    });
  }

  /* ============================================================
     5) USModule —— 超声无损检测
     ============================================================ */
  const USModule = (() => {
    let pointIdx = 0, playing = false, timer = 0, revealT = 0, rafId = 0;

    function points() {
      return (DATA.us.states[currentState] || DATA.us.states.intact).points;
    }

    function drawWave(revealRatio = 1) {
      const us = DATA.us;
      const p = points()[pointIdx];
      if (!p || p.raw.length < 4) {
        drawChart($("#us-canvas"), {
          x: [0, 10], y: [-1, 1], xlabel: "Time (µs)", ylabel: "Amplitude",
          title: "演示数据缺失", series: [{ x: [0, 10], y: [0, 0], color: "#8dd9df", label: "no data" }]
        });
        return;
      }
      const t = us.time_us, n = p.raw.length;
      const m = Math.max(2, Math.floor(n * revealRatio));
      const xs = t.slice(0, m);
      const raw = p.raw.slice(0, m);
      const env = p.envelope.slice(0, m);
      drawChart($("#us-canvas"), {
        x: [t[0], t[t.length - 1]],
        y: [-1.3, 1.3],
        xlabel: "Time (µs)",
        ylabel: "Amplitude (norm.)",
        title: `${p.id} · ${STATE_LABEL[currentState]}`,
        series: [
          { x: xs, y: raw, color: "rgba(155,181,186,.75)", label: "Raw A-scan" },
          { x: xs, y: env, color: "#e9a46e", label: "Hilbert envelope" }
        ]
      });
    }

    function updateVerdict() {
      const p = points()[pointIdx];
      if (!p) return;
      $("#us-point-id").textContent = p.id;
      const stEl = $("#us-status");
      const map = { intact: ["Intact", "st-intact"], suspected: ["Suspected Damage", "st-suspected"], damage: ["Damage", "st-damage"] };
      const [txt, cls] = map[p.status] || ["—", "st-intact"];
      stEl.textContent = txt;
      stEl.className = "verdict-status " + cls;
      // 测点轨迹
      const track = $("#us-track");
      track.innerHTML = "";
      points().forEach((pt, i) => {
        const d = document.createElement("div");
        d.className = "pt st-" + pt.status + (i === pointIdx ? " current" : "");
        d.title = `${pt.id} · ${pt.status}`;
        track.appendChild(d);
      });
      // 下拉
      $("#us-point").value = String(pointIdx);
    }

    function buildScanSVG() {
      const svg = $("#us-scan-svg");
      const pts = points();
      const n = pts.length;
      const x0 = 40, x1 = 280, y = 118;
      const step = n > 1 ? (x1 - x0) / (n - 1) : 0;
      let dots = "", labels = "";
      pts.forEach((p, i) => {
        const cx = x0 + i * step;
        const col = p.status === "damage" ? "#e07864" : p.status === "suspected" ? "#e9a46e" : "#82d2a0";
        dots += `<circle class="us-dot" data-i="${i}" cx="${cx}" cy="${y}" r="4" fill="${col}" opacity="0.9"/>`;
        labels += `<text x="${cx}" y="${y + 18}" fill="#aecdd3" font-size="12" text-anchor="middle">${p.id}</text>`;
      });
      svg.innerHTML = `
        <rect x="20" y="96" width="280" height="58" fill="#254958" stroke="rgba(170,235,240,.35)"/>
        <rect x="20" y="96" width="280" height="7" fill="#8fb4bf"/>
        <line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="rgba(152,225,233,.35)" stroke-dasharray="3 4"/>
        ${dots}${labels}
        <g id="us-probe" transform="translate(${x0},70)">
          <rect x="-9" y="0" width="18" height="26" rx="2" fill="#0d2831" stroke="#8dd9df" stroke-width="1.2"/>
          <line x1="0" y1="26" x2="0" y2="48" stroke="#8dd9df" stroke-width="1.4"/>
          <circle id="us-pulse" cx="0" cy="48" r="3" fill="none" stroke="#e9a46e" stroke-width="1.4" opacity="0"/>
        </g>
        <text x="20" y="20" fill="#aecdd3" font-size="13">蜂窝夹层试件 · 单线扫描 · ${STATE_LABEL[currentState]}</text>
      `;
    }

    function moveProbe(i) {
      const pts = points();
      const n = pts.length;
      const x0 = 40, x1 = 280;
      const step = n > 1 ? (x1 - x0) / (n - 1) : 0;
      const g = $("#us-probe");
      if (g) g.setAttribute("transform", `translate(${x0 + i * step},70)`);
    }

    function pulseOnce() {
      const c = $("#us-pulse");
      if (!c) return;
      c.animate(
        [{ opacity: 1, r: 3 }, { opacity: 0, r: 16 }],
        { duration: 480, easing: "ease-out" }
      );
    }

    function revealAnimate() {
      cancelAnimationFrame(rafId);
      const start = performance.now();
      const dur = 620;
      (function tick(now) {
        revealT = clamp((now - start) / dur, 0, 1);
        drawWave(revealT);
        if (revealT < 1) rafId = requestAnimationFrame(tick);
      })(start);
    }

    function gotoPoint(i) {
      const pts = points();
      pointIdx = clamp(i, 0, pts.length - 1);
      moveProbe(pointIdx);
      pulseOnce();
      updateVerdict();
      revealAnimate();
    }

    function play() {
      if (playing) { pause(); return; }
      playing = true;
      $("#us-play").textContent = "⏸ 暂停";
      gotoPoint(0);
      timer = setInterval(() => {
        const n = points().length;
        if (pointIdx >= n - 1) { pause(); return; }
        gotoPoint(pointIdx + 1);
      }, 1500);
    }
    function pause() {
      playing = false;
      clearInterval(timer);
      const b = $("#us-play");
      if (b) b.textContent = "▶ 播放";
    }

    function refresh() {
      pause();
      pointIdx = 0;
      buildScanSVG();
      const sel = $("#us-point");
      sel.innerHTML = points().map((p, i) => `<option value="${i}">${p.id} · ${p.x_mm} mm</option>`).join("");
      updateVerdict();
      drawWave(1);
    }

    function init() {
      $("#us-play").addEventListener("click", play);
      $("#us-replay").addEventListener("click", () => { pause(); gotoPoint(0); });
      $("#us-point").addEventListener("change", (e) => { pause(); gotoPoint(+e.target.value); });
      refresh();
    }

    return { init, refresh };
  })();

  /* ============================================================
     6) EMModule —— 电磁无损检测
     ============================================================ */
  const EMModule = (() => {
    let playing = false, timer = 0, stepIdx = 0, curveIdx = 0;

    function emState() {
      return DATA.em && DATA.em.states ? DATA.em.states[currentState] : null;
    }

    function drawS11() {
      const em = DATA.em;
      const st = emState();
      if (!em || !st) {
        drawChart($("#em-canvas"), {
          x: [8, 12], y: [-20, 0], xlabel: "Frequency (GHz)", ylabel: "S11 (dB)",
          title: "演示数据缺失", series: [{ x: [8, 12], y: [-10, -10], color: "#8dd9df", label: "no data" }]
        });
        return;
      }
      const f = em.frequency_GHz;
      const ref = em.reference_curve;
      const c = st.curves[curveIdx];
      drawChart($("#em-canvas"), {
        x: [f[0], f[f.length - 1]],
        y: [-18, -4],
        xlabel: "Frequency (GHz)",
        ylabel: "S11 (dB)",
        title: `${c.id} · ${c.position_zh} · ${STATE_LABEL[currentState]}`,
        series: [
          { x: f, y: ref.s11_db, color: "rgba(155,181,186,.8)", dash: true, label: "完好参考 REF" },
          { x: f, y: c.s11_db, color: "#8dd9df", label: `${c.id} 当前测点` }
        ]
      });
    }

    function drawMap() {
      const st = emState();
      const canvas = $("#em-map-canvas");
      const { ctx, w, h } = setupCanvas(canvas, 150);
      ctx.clearRect(0, 0, w, h);
      if (!st || !st.response_map) return;
      const { nx, ny, values } = st.response_map;
      const cw = w / nx, ch = h / ny;
      // 与 aerorepair 一致的蓝→橙映射
      const stops = [[53, 81, 100], [69, 107, 124], [91, 144, 153], [183, 217, 216], [228, 196, 156], [239, 157, 104]];
      function color(v) {
        const t = clamp(v, 0, 1) * (stops.length - 1);
        const i = Math.min(stops.length - 2, Math.floor(t));
        const k = t - i;
        const a = stops[i], b = stops[i + 1];
        return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;
      }
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          ctx.fillStyle = color(values[y * nx + x]);
          ctx.fillRect(x * cw, y * ch, cw + 0.5, ch + 0.5);
        }
    }

    function buildScanSVG() {
      const svg = $("#em-scan-svg");
      const x0 = 50, x1 = 270, y0 = 96, y1 = 168;
      const cols = 6, rows = 3;
      let grid = "";
      for (let i = 0; i < cols; i++) {
        const x = x0 + (i * (x1 - x0)) / (cols - 1);
        grid += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="rgba(152,225,233,.22)" stroke-width="0.7"/>`;
      }
      for (let j = 0; j < rows; j++) {
        const y = y0 + (j * (y1 - y0)) / (rows - 1);
        grid += `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="rgba(152,225,233,.22)" stroke-width="0.7"/>`;
      }
      // 修复区
      const repX = (x0 + x1) / 2, repY = (y0 + y1) / 2;
      svg.innerHTML = `
        <rect x="20" y="86" width="280" height="96" fill="#254958" stroke="rgba(170,235,240,.35)"/>
        ${grid}
        <ellipse cx="${repX}" cy="${repY}" rx="52" ry="26" fill="none" stroke="#e9a46e" stroke-dasharray="4 3" opacity="0.8"/>
        <text x="${repX}" y="${repY + 3}" fill="#e9a46e" font-size="12" text-anchor="middle">修复/关注区</text>
        <g id="em-probe" transform="translate(${x0},${y0})">
          <rect x="-10" y="-34" width="20" height="34" rx="2" fill="#0d2831" stroke="#8dd9df" stroke-width="1.2"/>
          <rect x="-6" y="-6" width="12" height="8" fill="#8dd9df" opacity="0.55"/>
        </g>
        <text x="20" y="20" fill="#aecdd3" font-size="13">波导探头光栅扫描 · ${STATE_LABEL[currentState]}</text>
      `;
    }

    function moveProbe(k) {
      const x0 = 50, x1 = 270, y0 = 96, y1 = 168;
      const cols = 6, rows = 3;
      const i = k % cols, j = Math.floor(k / cols) % rows;
      const x = x0 + (i * (x1 - x0)) / (cols - 1);
      const y = y0 + (j * (y1 - y0)) / (rows - 1);
      const g = $("#em-probe");
      if (g) g.setAttribute("transform", `translate(${x},${y})`);
    }

    function buildFlow() {
      const list = $("#ntff-list");
      const flow = (DATA.em && DATA.em.processing_flow) || [
        { en: "Waveguide Probe Scanning", zh: "波导探头扫描" },
        { en: "Calibration / De-embedding", zh: "校准与端口去嵌" },
        { en: "Near-field Response Map", zh: "近场响应重建" },
        { en: "Near-to-Far-Field Transformation", zh: "近远场变换" },
        { en: "RCS / EM Performance Evaluation", zh: "RCS 或电磁性能评价" }
      ];
      list.innerHTML = flow
        .map((s, i) => `<li data-step="${i + 1}"><b>${s.en}</b><small>${s.zh}</small></li>`)
        .join("");
    }

    function lightFlow(n) {
      $$("#ntff-list li").forEach((li, i) => li.classList.toggle("lit", i < n));
    }

    function play() {
      if (playing) { pause(); return; }
      playing = true;
      $("#em-play").textContent = "⏸ 暂停";
      stepIdx = 0;
      lightFlow(1);
      const total = 18;
      timer = setInterval(() => {
        moveProbe(stepIdx);
        const frac = (stepIdx + 1) / total;
        lightFlow(1 + Math.floor(frac * 4));
        if (++stepIdx >= total) { pause(); lightFlow(5); }
      }, 420);
    }
    function pause() {
      playing = false;
      clearInterval(timer);
      const b = $("#em-play");
      if (b) b.textContent = "▶ 播放";
    }

    function buildCurveButtons() {
      const st = emState();
      const holder = $("#em-curve-btns");
      holder.innerHTML = "";
      if (!st) return;
      st.curves.forEach((c, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "ctl" + (i === curveIdx ? " active" : "");
        b.textContent = c.id;
        b.title = c.position_zh;
        b.addEventListener("click", () => { curveIdx = i; buildCurveButtons(); drawS11(); });
        holder.appendChild(b);
      });
    }

    function refresh() {
      pause();
      curveIdx = 0;
      buildScanSVG();
      buildCurveButtons();
      drawS11();
      drawMap();
      lightFlow(0);
    }

    function init() {
      buildFlow();
      $("#em-play").addEventListener("click", play);
      $("#em-replay").addEventListener("click", () => { pause(); stepIdx = 0; moveProbe(0); lightFlow(0); });
      refresh();
    }

    return { init, refresh };
  })();

  /* ============================================================
     7) RepairModule —— 挖补修复剖面分步示意
     ============================================================ */
  const RepairModule = (() => {
    let step = 0;
    const NS = "http://www.w3.org/2000/svg";

    // 修复剖面：x 20..540，上蒙皮 y 92..106，芯层 y 106..188，下蒙皮 y 188..202
    // 挖补区中心 cx=280，挖补斜面外半径 R=110，内半径 r=46（锥台斜面坑）
    function draw() {
      const svg = $("#repair-svg");
      const cx = 280, R = 110, r = 46;
      const s = step;
      const skinTop = 92, skinH = 14, skinBot = skinTop + skinH; // 上蒙皮 92..106
      const coreTop = skinBot, coreH = 82, coreBot = coreTop + coreH; // 芯层 106..188

      // 各层可见性随步骤变化
      const showMark = s >= 0;                 // 1 标记
      const showGrind = s >= 1;                // 2 打磨出斜面
      const showCoreOut = s >= 2;              // 3 去除损伤芯
      const showCoreNew = s >= 2;              // 3 嵌入新芯
      const showLayup = s >= 3;                // 4 胶膜+补片
      const showCure = s >= 4;                 // 5 固化
      const showFinal = s >= 5;                // 6 后检完成

      // 上蒙皮（复合材料母板）：挖补后中央形成斜面坑
      function upperSkin() {
        if (!showGrind) {
          const hole = showMark
            ? `<circle cx="${cx}" cy="${skinTop + 7}" r="${showFinal ? 0 : 10}" fill="#05090b"/>` : "";
          return `<rect x="20" y="${skinTop}" width="520" height="${skinH}" fill="#8fb4bf"/>${hole}`;
        }
        // 挖补后：母板被磨成锥台斜面坑（上宽下窄）。
        // 左段（完整厚度）→ 斜面 → 坑底（薄），右侧对称
        return `
          <path d="M20,${skinTop} H${cx - R} L${cx - r},${skinBot} H${cx + r} L${cx + R},${skinTop} H540 V${skinBot} H20 Z"
                fill="#8fb4bf"/>
          <path d="M${cx - R},${skinTop} L${cx - r},${skinBot} M${cx + r},${skinBot} L${cx + R},${skinTop}"
                stroke="#6d8e99" stroke-width="1" fill="none"/>
        `;
      }

      // 蜂窝芯层：挖补/去芯后中央去除，修补时嵌入新芯塞
      function core() {
        if (!showCoreOut) {
          return `<rect x="20" y="${coreTop}" width="520" height="${coreH}" fill="#57707c"/>
            <rect x="20" y="${coreTop}" width="520" height="${coreH}" fill="url(#hexpat)"/>`;
        }
        const holeW = 2 * r;
        let inner = "";
        if (showCoreNew) {
          inner = `<rect x="${cx - r}" y="${coreTop}" width="${holeW}" height="${coreH}" fill="#86c2ad"/>
            <rect x="${cx - r}" y="${coreTop}" width="${holeW}" height="${coreH}" fill="url(#hexpat2)"/>
            <rect x="${cx - r}" y="${coreTop}" width="${holeW}" height="${coreH}" fill="none" stroke="#a9d9c8" stroke-width="1.2"/>`;
        }
        return `
          <rect x="20" y="${coreTop}" width="${(cx - r) - 20}" height="${coreH}" fill="#57707c"/>
          <rect x="20" y="${coreTop}" width="${(cx - r) - 20}" height="${coreH}" fill="url(#hexpat)"/>
          <rect x="${cx + r}" y="${coreTop}" width="${540 - (cx + r)}" height="${coreH}" fill="#57707c"/>
          <rect x="${cx + r}" y="${coreTop}" width="${540 - (cx + r)}" height="${coreH}" fill="url(#hexpat)"/>
          ${inner}
        `;
      }

      function lowerSkin() {
        return `<rect x="20" y="${coreBot}" width="520" height="14" fill="#8fb4bf"/>`;
      }

      // 挖补补片：沿母板斜面逐层台阶式嵌入，与母板齐平（不凸出上表面）
      // 斜面方向与母板斜面一致；胶层沿斜面分布
      function layup() {
        if (!showLayup) return "";
        // 三段台阶补片，自坑底向上逐层加宽，跟随母板斜面
        const steps = 3;
        const sw = (R - r) / steps;             // 每段水平宽度
        const sh = skinH / steps;               // 每段竖直厚度
        let patches = "", glue = "";
        for (let i = 0; i < steps; i++) {
          const x0 = cx - r - i * sw;           // 该层底边左端（坑底窄）
          const x1 = cx + r + i * sw;           // 该层底边右端
          const yb = skinBot - i * sh;          // 该层底边 y（自坑底向上）
          const yt = yb - sh;                   // 该层顶边 y
          const tint = i === steps - 1 ? "#9fd6c2" : "#86c2ad";
          // 梯形补片：上宽下窄，左右两侧贴合母板斜面
          patches += `<path d="M${x0},${yb} H${x1} L${x1 + sw},${yt} H${x0 - sw} Z"
            fill="${tint}" opacity="0.97" stroke="#a9d9c8" stroke-width="0.7"/>`;
          // 胶层：沿该层斜面（左右两斜边）
          glue += `<line x1="${x0}" y1="${yb}" x2="${x0 - sw}" y2="${yt}" stroke="#e9a46e" stroke-width="1.6" opacity="0.9"/>
                   <line x1="${x1}" y1="${yb}" x2="${x1 + sw}" y2="${yt}" stroke="#e9a46e" stroke-width="1.6" opacity="0.9"/>`;
        }
        // 顶层补片与母板顶面齐平的封顶线（与蒙皮同平面，不外凸）
        const capY = skinTop;
        return glue + patches +
          `<line x1="${cx - R}" y1="${capY}" x2="${cx + R}" y2="${capY}" stroke="#a9d9c8" stroke-width="1" stroke-dasharray="3 2" opacity="0.8"/>`;
      }

      function cure() {
        if (!showCure) return "";
        // 真空袋 + 向下箭头（覆盖挖补斜面区）
        let arrows = "";
        for (let x = cx - R + 30; x <= cx + R - 30; x += 34) {
          arrows += `<line x1="${x}" y1="22" x2="${x}" y2="50" stroke="#8dd9df" stroke-width="1.6" marker-end="url(#arr)"/>`;
        }
        return `
          <path d="M${cx - R - 8},56 Q${cx},16 ${cx + R + 8},56 L${cx + R + 8},64 Q${cx},26 ${cx - R - 8},64 Z" fill="rgba(141,217,223,.14)" stroke="#8dd9df" stroke-dasharray="4 3"/>
          ${arrows}
          <text x="${cx}" y="82" fill="#9fd6e0" font-size="13" text-anchor="middle">真空袋 / 加压固化（示意）</text>
        `;
      }

      function finalMark() {
        if (!showFinal) return "";
        return `<circle cx="${cx}" cy="${coreTop + 40}" r="16" fill="none" stroke="#9fdcb1" stroke-width="2"/>
          <path d="M${cx - 6},${coreTop + 40} l4,5 l9,-10" stroke="#9fdcb1" stroke-width="2.4" fill="none"/>
          <text x="${cx}" y="${coreTop + 74}" fill="#9fdcb1" font-size="13" text-anchor="middle">修复完成</text>`;
      }

      function marks() {
        if (!showMark || showGrind) return "";
        return `<line x1="${cx - R}" y1="${skinTop - 6}" x2="${cx + R}" y2="${skinTop - 6}" stroke="#e9a46e" stroke-dasharray="5 4" stroke-width="1.4"/>
          <circle cx="${cx - R}" cy="${skinTop - 6}" r="3" fill="#e9a46e"/>
          <circle cx="${cx + R}" cy="${skinTop - 6}" r="3" fill="#e9a46e"/>
          <text x="${cx}" y="${skinTop - 14}" fill="#e9a46e" font-size="13" text-anchor="middle">修理边界标记</text>`;
      }

      // 图3 风格关键标注：仅在修补层出现后与固化前显示斜面/补片/胶层标注
      function annotations() {
        if (!showLayup || showCure) return "";
        return `
          <text x="${cx + R + 12}" y="${skinTop + 8}" fill="#9fd6c2" font-size="12.5">复合材料补片</text>
          <line x1="${cx + R + 8}" y1="${skinTop + 6}" x2="${cx + r + 18}" y2="${skinTop + 6}" stroke="#9fd6c2" stroke-width="0.8"/>
          <text x="${cx - R - 12}" y="${skinTop + 4}" fill="#e9a46e" font-size="12.5" text-anchor="end">粘接胶层</text>
          <line x1="${cx - R - 8}" y1="${skinTop + 2}" x2="${cx - r - 18}" y2="${skinTop + 2}" stroke="#e9a46e" stroke-width="0.8"/>
          <text x="${cx + R + 12}" y="${skinBot + 14}" fill="#aecdd3" font-size="12.5">挖补斜率 α</text>
          <text x="28" y="${coreTop + 46}" fill="#aecdd3" font-size="12.5">蜂窝芯层</text>
          <text x="28" y="${skinTop - 10}" fill="#aecdd3" font-size="12.5">复合材料母板</text>
        `;
      }

      svg.innerHTML = `
        <defs>
          <!-- 蜂窝芯竖向剖面：胞元轴向竖直，剖面仅切出等距竖线（参照修复构型图） -->
          <pattern id="hexpat" width="7" height="10" patternUnits="userSpaceOnUse">
            <line x1="3.5" y1="0" x2="3.5" y2="10" stroke="rgba(152,225,233,.25)" stroke-width="0.8"/>
          </pattern>
          <pattern id="hexpat2" width="7" height="10" patternUnits="userSpaceOnUse">
            <line x1="3.5" y1="0" x2="3.5" y2="10" stroke="rgba(20,60,50,.55)" stroke-width="0.8"/>
          </pattern>
          <marker id="arr" markerWidth="8" markerHeight="8" refX="4" refY="6" orient="auto">
            <path d="M1,1 L4,6 L7,1" stroke="#8dd9df" stroke-width="1.4" fill="none"/>
          </marker>
        </defs>
        <text x="20" y="18" fill="#aecdd3" font-size="14">蜂窝夹层结构挖补（scarf）修复剖面 · 示意（非比例）</text>
        ${core()}
        ${upperSkin()}
        ${lowerSkin()}
        ${marks()}
        ${layup()}
        ${annotations()}
        ${cure()}
        ${finalMark()}
        <text x="30" y="252" fill="#aecdd3" font-size="12.5">上蒙皮 y=92..106 · 蜂窝芯 y=106..188 · 下蒙皮 y=188..202</text>
      `;
    }

    function render() {
      draw();
      const steps = DATA.repair.steps || [];
      const list = $("#repair-steps");
      list.innerHTML = steps
        .map(
          (st, i) => `<li data-i="${i}" class="${i === step ? "lit" : i < step ? "done" : ""}">
            <b><span class="rs-num">${String(i + 1).padStart(2, "0")}</span>${st.title_zh}</b>
            ${st.detail_zh}
          </li>`
        )
        .join("");
      list.querySelectorAll("li").forEach((li) =>
        li.addEventListener("click", () => { step = +li.dataset.i; render(); })
      );
      const cur = steps[step];
      $("#repair-step-badge").textContent = cur
        ? `${String(step + 1).padStart(2, "0")} · ${cur.title_zh}`
        : "";
      $("#repair-prev").disabled = step === 0;
      $("#repair-next").disabled = step >= steps.length - 1;
      $("#closed-loop").hidden = step < steps.length - 1;
    }

    function init() {
      $("#repair-prev").addEventListener("click", () => { if (step > 0) { step--; render(); } });
      $("#repair-next").addEventListener("click", () => {
        if (step < (DATA.repair.steps || []).length - 1) { step++; render(); }
      });
      $("#view-repaired").addEventListener("click", () => {
        setDamageState("repaired");
        document.getElementById("damage").scrollIntoView({ behavior: "smooth" });
      });
      render();
    }

    return { init, render };
  })();

  /* ============================================================
     8) 流程条：点击跳转 + 滚动高亮 + 自动演示
     ============================================================ */
  function initFlowbar() {
    const order = ["damage", "sense", "probe", "repair"];
    const nodes = Object.fromEntries(
      $$(".flow-node").map((n) => [n.dataset.goto, n])
    );
    // 点击跳转
    Object.entries(nodes).forEach(([key, node]) =>
      node.addEventListener("click", () =>
        document.getElementById(key).scrollIntoView({ behavior: "smooth" })
      )
    );
    // 滚动高亮
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            Object.values(nodes).forEach((n) => n.classList.remove("active"));
            nodes[en.target.id] && nodes[en.target.id].classList.add("active");
            $$(".module-nav a").forEach((a) =>
              a.classList.toggle("active", a.dataset.nav === en.target.id)
            );
          }
        });
      },
      { rootMargin: "-40% 0px -50% 0px" }
    );
    order.forEach((id) => obs.observe(document.getElementById(id)));

    // 下一步按钮
    $$(".next-btn[data-next]").forEach((b) =>
      b.addEventListener("click", () =>
        document.getElementById(b.dataset.next).scrollIntoView({ behavior: "smooth" })
      )
    );

    // 自动演示（轻量：仅按序高亮 + 滚动）
    $("#start-workflow").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      if (btn.classList.contains("running")) return;
      btn.classList.add("running");
      btn.textContent = "演示中…";
      for (const id of order) {
        document.getElementById(id).scrollIntoView({ behavior: "smooth" });
        await new Promise((r) => setTimeout(r, 2600));
      }
      btn.classList.remove("running");
      btn.textContent = "▶ 开始演示";
    });
  }

  /* ============================================================
     9) 初始化
     ============================================================ */
  async function boot() {
    await loadAll();
    DamageViewer.init(); // 异步加载 three，不阻塞其余
    USModule.init();
    EMModule.init();
    RepairModule.init();
    initFlowbar();
    setDamageState("intact");
    $$(".state-switch button").forEach((b) =>
      b.addEventListener("click", () => setDamageState(b.dataset.state))
    );
    window.addEventListener("resize", () => {
      USModule.refresh();
      EMModule.refresh();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
