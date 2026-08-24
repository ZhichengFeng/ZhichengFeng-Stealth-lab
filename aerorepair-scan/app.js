(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const lerp = (a, b, t) => a + (b - a) * t;

  const fallbackCases = [
    { display_name: "完好基准", id: "intact_baseline", description: "平滑参考背景，不形成集中异常区。", base_severity: .03, damage_likelihood: .02, rcs_base: .02, confidence_base: .78, polarization_gain: { 水平: 1, 垂直: .96 }, distance_decay_mm: 72, frequency_profile: { mode: "flat", slope: .02, ripple_strength: .01 }, anomaly: { shape: "none", center: [0, 0], sigma: [.22, .16], amplitude: 0, edge_strength: 0, orientation_deg: 0 }, suggested_action: "作为概念参考状态，不形成工程判定。" },
    { display_name: "理想修复", id: "ideal_repair", description: "修补区与参考状态差异较小，用于演示低异常趋势。", base_severity: .10, damage_likelihood: .06, rcs_base: .16, confidence_base: .76, polarization_gain: { 水平: 1, 垂直: .92 }, distance_decay_mm: 68, frequency_profile: { mode: "gentle_high_frequency", slope: .08, ripple_strength: .03 }, anomaly: { shape: "ellipse", center: [.02, -.01], sigma: [.25, .17], amplitude: .12, edge_strength: .05, orientation_deg: -6 }, suggested_action: "记录当前状态，并与参考状态复核。" },
    { display_name: "表面台阶偏大", id: "surface_step", description: "修补边缘出现环带型散射增强。", base_severity: .72, damage_likelihood: .28, rcs_base: 1.42, confidence_base: .72, polarization_gain: { 水平: 1.12, 垂直: .88 }, distance_decay_mm: 58, frequency_profile: { mode: "high_frequency_emphasis", slope: .62, ripple_strength: .08 }, anomaly: { shape: "elliptic_ring", center: [0, 0], sigma: [.43, .29], amplitude: .82, edge_strength: .92, orientation_deg: 2 }, suggested_action: "局部复扫并检查修补边缘。" },
    { display_name: "胶层厚度异常", id: "adhesive_thickness", description: "具有频率敏感性的条带—椭圆复合异常。", base_severity: .48, damage_likelihood: .62, rcs_base: .76, confidence_base: .66, polarization_gain: { 水平: .94, 垂直: 1.08 }, distance_decay_mm: 62, frequency_profile: { mode: "resonant", ripple_strength: .28, resonance_ghz: 12.4, resonance_width_ghz: 3.2 }, anomaly: { shape: "gaussian_band", center: [-.08, .03], sigma: [.34, .10], amplitude: .56, edge_strength: .26, orientation_deg: 12 }, suggested_action: "关注敏感频段，并结合工艺记录复核。" },
    { display_name: "面板脱粘", id: "panel_disbond", description: "局部双峰幅相异常，展示集中内部异常趋势。", base_severity: .67, damage_likelihood: .84, rcs_base: 1.04, confidence_base: .70, polarization_gain: { 水平: 1.04, 垂直: 1.12 }, distance_decay_mm: 60, frequency_profile: { mode: "broadband_with_phase", ripple_strength: .16, resonance_ghz: 9.2, resonance_width_ghz: 4.6 }, anomaly: { shape: "double_gaussian", center: [.12, .04], sigma: [.20, .15], amplitude: .76, edge_strength: .42, orientation_deg: -18 }, suggested_action: "标记异常区，并安排局部超声复核。" },
    { display_name: "蜂窝芯压溃", id: "honeycomb_crush", description: "较宽的低—中频增强异常，展示扩展响应趋势。", base_severity: .61, damage_likelihood: .79, rcs_base: .90, confidence_base: .68, polarization_gain: { 水平: 1.08, 垂直: .98 }, distance_decay_mm: 66, frequency_profile: { mode: "low_mid_frequency_emphasis", ripple_strength: .12, resonance_ghz: 6.8, resonance_width_ghz: 4 }, anomaly: { shape: "broad_ellipse", center: [-.03, -.02], sigma: [.42, .25], amplitude: .69, edge_strength: .20, orientation_deg: 8 }, suggested_action: "扩大复扫范围，并安排局部超声复核。" }
  ];

  const palette = [
    [0, [53, 81, 100]], [.18, [69, 107, 124]], [.42, [91, 144, 153]],
    [.67, [183, 217, 216]], [.84, [228, 196, 156]], [1, [239, 157, 104]]
  ];

  const els = {
    form: $("#scan-form"), scene: $("#scene-input"), frequency: $("#frequency-input"),
    frequencyOutput: $("#frequency-output"), distance: $("#distance-input"), distanceOutput: $("#distance-output"),
    reset: $("#reset-button"), note: $("#case-note"), canvas: $("#heatmap-canvas"),
    state: $("#scan-state"), percent: $("#scan-percent"), progress: $("#progress-bar"),
    nf: $("#metric-nf"), area: $("#metric-area"), location: $("#metric-location"),
    damage: $("#metric-damage"), rcs: $("#metric-rcs"), risk: $("#metric-risk"),
    evaluation: $("#metric-evaluation"), confidence: $("#metric-confidence"),
    summaryTitle: $("#summary-title"), summaryText: $("#summary-text"), summaryAction: $("#summary-action")
  };

  let cases = fallbackCases;
  let caseMap = new Map(cases.map((item) => [item.display_name, item]));
  let animationFrame = 0;

  function frequencyGain(item, frequency) {
    const profile = item.frequency_profile || {};
    const normalized = (frequency - 2) / 16;
    let gain;
    if (profile.mode === "high_frequency_emphasis") gain = .54 + .82 * normalized;
    else if (profile.mode === "gentle_high_frequency") gain = .86 + .22 * normalized;
    else if (["resonant", "broadband_with_phase", "low_mid_frequency_emphasis"].includes(profile.mode)) {
      const center = Number(profile.resonance_ghz || 10);
      const width = Number(profile.resonance_width_ghz || 4);
      const base = profile.mode === "resonant" ? .68 : profile.mode === "broadband_with_phase" ? .80 : .58;
      const peak = profile.mode === "resonant" ? .65 : profile.mode === "broadband_with_phase" ? .42 : .68;
      gain = base + peak * Math.exp(-.5 * ((frequency - center) / width) ** 2);
    } else gain = .98 + Number(profile.slope || 0) * (normalized - .5);
    gain += Number(profile.ripple_strength || 0) * Math.sin(frequency * .82 + .35);
    return clamp(gain, .4, 1.52);
  }

  function rotate(x, y, center, degrees) {
    const angle = degrees * Math.PI / 180;
    const x0 = x - Number(center?.[0] || 0);
    const y0 = y - Number(center?.[1] || 0);
    return [Math.cos(angle) * x0 + Math.sin(angle) * y0, -Math.sin(angle) * x0 + Math.cos(angle) * y0];
  }

  function patternAt(x, y, anomaly, spread) {
    if (!anomaly || anomaly.shape === "none") return 0;
    const [xr, yr] = rotate(x, y, anomaly.center, Number(anomaly.orientation_deg || 0));
    const sx = Math.max(Number(anomaly.sigma?.[0] || .25) * spread, .03);
    const sy = Math.max(Number(anomaly.sigma?.[1] || .16) * spread, .03);
    const rho = (xr / sx) ** 2 + (yr / sy) ** 2;
    const gaussian = Math.exp(-.5 * rho);
    const edge = Math.exp(-.5 * ((Math.sqrt(rho + 1e-9) - 1) / .14) ** 2);
    let value;
    if (anomaly.shape === "elliptic_ring") value = .22 * gaussian + .88 * edge;
    else if (anomaly.shape === "gaussian_band") value = Math.exp(-.5 * (xr / sx) ** 2 - .5 * (yr / sy) ** 4);
    else if (anomaly.shape === "broad_ellipse") value = Math.exp(-.38 * rho);
    else if (anomaly.shape === "double_gaussian") {
      const second = Math.exp(-.5 * (((xr + .28) / (sx * .78)) ** 2 + ((yr + .08) / (sy * .78)) ** 2));
      value = gaussian + .62 * second;
    } else value = gaussian;
    return value + Number(anomaly.edge_strength || 0) * .38 * edge;
  }

  function textureAt(x, y, seed) {
    const raw = Math.sin(x * 12.9898 + y * 78.233 + seed * .00013) * 43758.5453;
    const noise = raw - Math.floor(raw);
    return clamp(.52 + .28 * Math.sin(x * 7 + seed) + .20 * Math.cos(y * 9 - seed) + .18 * (noise - .5), 0, 1);
  }

  function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
  }

  function locationLabel(center) {
    const x = Number(center?.[0] || 0);
    const y = Number(center?.[1] || 0);
    return `扫描域${x < -.12 ? "左侧" : x > .12 ? "右侧" : "中央"} · ${y > .07 ? "上侧" : y < -.07 ? "下侧" : "中线"}`;
  }

  function computeResult(item, frequency, polarization, distance) {
    const frequencyGainValue = frequencyGain(item, frequency);
    const polarizationGain = Number(item.polarization_gain?.[polarization] || 1);
    const decay = Number(item.distance_decay_mm || 64);
    const distanceGain = .68 + .32 * Math.exp(-(distance - 20) / decay);
    const spread = 1 + .32 * (distance - 20) / 80;
    const severity = Number(item.base_severity) * frequencyGainValue * polarizationGain * distanceGain;
    const nf = clamp(2 + 83 * severity, 1, 97);
    const damage = clamp(100 * Number(item.damage_likelihood) * (.83 + .18 * frequencyGainValue) * (.94 + .08 * polarizationGain), 1, 97);
    const rcs = Math.max(0, Number(item.rcs_base) * frequencyGainValue * (.88 + .12 * polarizationGain) * distanceGain);
    const confidence = clamp(100 * Number(item.confidence_base) + Math.min(nf, 55) * .11 - Math.max(distance - 60, 0) * .09, 58, 94);
    const hasAnomaly = item.anomaly?.shape !== "none";
    const sigma = item.anomaly?.sigma || [.2, .15];
    const area = hasAnomaly ? clamp(4 + 38 * Number(sigma[0]) * Number(sigma[1]) / (.46 * .31) * Math.min(frequencyGainValue, 1.2) * spread, 2, 42) : 0;
    const location = hasAnomaly ? locationLabel(item.anomaly.center) : "未形成集中异常区";
    const risk = rcs < .35 ? "低" : rcs < .9 ? "中" : "高";
    const evaluation = nf < 18 && damage < 24 ? "差异较低" : nf < 48 && damage < 68 ? "建议复查" : "高风险提示";
    return { item, frequency, polarization, distance, frequencyGain: frequencyGainValue, polarizationGain, distanceGain, spread, nf, damage, rcs, confidence, area, location, risk, evaluation };
  }

  function paletteColor(value) {
    const t = clamp(value / 100, 0, 1);
    for (let i = 1; i < palette.length; i += 1) {
      if (t <= palette[i][0]) {
        const [x0, c0] = palette[i - 1];
        const [x1, c1] = palette[i];
        const local = (t - x0) / (x1 - x0);
        return c0.map((channel, index) => Math.round(lerp(channel, c1[index], local)));
      }
    }
    return palette.at(-1)[1];
  }

  function drawHeatmap(result, progress = 1) {
    const canvas = els.canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    const width = canvas.width;
    const height = canvas.height;
    const plot = { x: 58, y: 34, width: width - 92, height: height - 88 };
    ctx.fillStyle = "#081d24";
    ctx.fillRect(0, 0, width, height);
    const cols = 80;
    const rows = 50;
    const visibleCols = Math.max(1, Math.round(cols * progress));
    const cellW = plot.width / cols;
    const cellH = plot.height / rows;
    const seed = hashString(`${result.item.id}|${result.frequency}|${result.polarization}|${result.distance}`) * 1000;
    for (let row = 0; row < rows; row += 1) {
      const y = .625 - (row / (rows - 1)) * 1.25;
      for (let col = 0; col < visibleCols; col += 1) {
        const x = -1 + (col / (cols - 1)) * 2;
        const pattern = patternAt(x, y, result.item.anomaly, result.spread);
        const texture = textureAt(x, y, seed);
        const amplitude = Number(result.item.anomaly?.amplitude || 0) * result.frequencyGain * result.polarizationGain * result.distanceGain;
        const value = clamp(2.4 + 82 * amplitude * pattern + 3.2 * (texture - .35), 0, 100);
        const [r, g, b] = paletteColor(value);
        ctx.fillStyle = `rgb(${r} ${g} ${b})`;
        ctx.fillRect(plot.x + col * cellW, plot.y + row * cellH, Math.ceil(cellW + .4), Math.ceil(cellH + .4));
      }
    }
    ctx.strokeStyle = "rgba(209, 238, 241, .62)";
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    for (let i = 0; i <= 120; i += 1) {
      const angle = i / 120 * Math.PI * 2;
      const x = plot.x + plot.width * (.5 + .46 / 2 * Math.cos(angle));
      const y = plot.y + plot.height * (.5 - .31 / 1.25 * Math.sin(angle));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    if (progress < 1) {
      const scanX = plot.x + plot.width * progress;
      const gradient = ctx.createLinearGradient(scanX - 24, 0, scanX + 12, 0);
      gradient.addColorStop(0, "rgba(141,217,223,0)");
      gradient.addColorStop(.72, "rgba(141,217,223,.28)");
      gradient.addColorStop(1, "rgba(200,246,246,.9)");
      ctx.fillStyle = gradient;
      ctx.fillRect(scanX - 24, plot.y, 36, plot.height);
    }
    ctx.strokeStyle = "rgba(143, 200, 207, .34)";
    ctx.strokeRect(plot.x, plot.y, plot.width, plot.height);
    ctx.fillStyle = "#78969b";
    ctx.font = "12px Segoe UI, Microsoft YaHei, sans-serif";
    ctx.fillText("−1.0", plot.x - 10, height - 28);
    ctx.fillText("0", plot.x + plot.width / 2 - 3, height - 28);
    ctx.fillText("1.0", plot.x + plot.width - 13, height - 28);
    ctx.save();
    ctx.translate(18, plot.y + plot.height / 2 + 30);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("横向 y（归一化）", 0, 0);
    ctx.restore();
    ctx.fillText("扫描方向 x（归一化）", plot.x + plot.width / 2 - 56, height - 8);
  }

  function updateMetrics(result, scanning = false) {
    const fields = [els.nf, els.area, els.damage, els.rcs, els.evaluation, els.confidence];
    if (scanning) {
      fields.forEach((field) => { field.textContent = "计算中"; field.classList.remove("risk-high"); });
      els.location.textContent = "复数场重建中";
      els.risk.textContent = "相干融合中";
      return;
    }
    els.nf.textContent = `${result.nf.toFixed(1)}%`;
    els.area.textContent = `${result.area.toFixed(1)}%`;
    els.location.textContent = `${result.location} · 模拟`;
    els.damage.textContent = `${result.damage.toFixed(1)}%`;
    els.rcs.textContent = `+${result.rcs.toFixed(2)} dB`;
    els.risk.textContent = `${result.risk}风险 · simulated dB`;
    els.evaluation.textContent = result.evaluation;
    els.confidence.textContent = `${result.confidence.toFixed(1)}%`;
    els.rcs.classList.toggle("risk-high", result.risk === "高");
    els.evaluation.classList.toggle("risk-high", result.evaluation === "高风险提示");
    els.summaryTitle.textContent = `概念评估摘要 · ${result.item.display_name}`;
    els.summaryText.textContent = `${result.frequency.toFixed(1)} GHz、${result.polarization}极化、离表 ${Math.round(result.distance)} mm。近场差异 ${result.nf.toFixed(1)}%，异常区域约 ${result.area.toFixed(1)}%，内部损伤趋势 ${result.damage.toFixed(1)}%，最大潜在增量 +${result.rcs.toFixed(2)} simulated dB。`;
    els.summaryAction.textContent = `后续建议：${result.item.suggested_action || "结合参考状态复核。"} 对需要精确几何定量的内部缺陷，应使用经过验证的超声等方法复核。`;
  }

  function readInputs() {
    const item = caseMap.get(els.scene.value) || cases[0];
    const polarization = els.form.elements.polarization.value;
    return computeResult(item, Number(els.frequency.value), polarization, Number(els.distance.value));
  }

  function render(progress = 1, scanning = false) {
    const result = readInputs();
    els.frequencyOutput.textContent = `${result.frequency.toFixed(1)} GHz`;
    els.distanceOutput.textContent = `${Math.round(result.distance)} mm`;
    els.note.textContent = result.item.description;
    drawHeatmap(result, progress);
    updateMetrics(result, scanning);
    els.progress.style.width = `${Math.round(progress * 100)}%`;
    els.percent.textContent = `${Math.round(progress * 100)}%`;
    return result;
  }

  function scan(event) {
    event.preventDefault();
    cancelAnimationFrame(animationFrame);
    const button = els.form.querySelector(".scan-button");
    button.disabled = true;
    els.state.textContent = "多频相干近场扫描与重建中";
    const start = performance.now();
    const duration = 1350;
    updateMetrics(readInputs(), true);
    function tick(now) {
      const progress = clamp((now - start) / duration, 0, 1);
      render(progress, progress < 1);
      if (progress < 1) animationFrame = requestAnimationFrame(tick);
      else {
        button.disabled = false;
        els.state.textContent = "扫描完成，已生成概念结果";
        render(1, false);
      }
    }
    animationFrame = requestAnimationFrame(tick);
  }

  function populateCases() {
    els.scene.innerHTML = "";
    cases.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.display_name;
      option.textContent = item.display_name;
      els.scene.append(option);
    });
    els.scene.value = caseMap.has("理想修复") ? "理想修复" : cases[0].display_name;
  }

  function reset() {
    cancelAnimationFrame(animationFrame);
    els.scene.value = caseMap.has("理想修复") ? "理想修复" : cases[0].display_name;
    els.frequency.value = "10";
    els.distance.value = "50";
    els.form.elements.polarization.value = "水平";
    els.state.textContent = "扫描就绪";
    render(1, false);
  }

  async function loadCases() {
    try {
      const response = await fetch("./data/demo_cases.json", { cache: "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (Array.isArray(data.cases) && data.cases.length) cases = data.cases;
    } catch (error) {
      console.warn("AeroRepair demo data fallback in use", error);
    }
    caseMap = new Map(cases.map((item) => [item.display_name, item]));
    populateCases();
    render(1, false);
  }

  els.form.addEventListener("submit", scan);
  els.form.addEventListener("input", () => {
    els.state.textContent = "参数已更新，等待扫描";
    render(1, false);
  });
  els.form.addEventListener("change", () => render(1, false));
  els.reset.addEventListener("click", reset);
  window.addEventListener("resize", () => render(1, false), { passive: true });
  loadCases();
})();
