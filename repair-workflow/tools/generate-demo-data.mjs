/**
 * Repair Workflow 演示数据生成器（确定性合成数据）
 *
 * 用途：为 repair-workflow 模块生成超声 A-scan / Hilbert 包络与电磁 S11 演示数据。
 * 物理定位：合成演示信号，仅用于展示交互、数据结构与判读流程；
 * 不来自真实试件、仪器或仿真，不能解释为检测精度或工程判据。
 *
 * 运行：node repair-workflow/tools/generate-demo-data.mjs
 * 输出：../data/ultrasonic-demo.json 与 ../data/electromagnetic-demo.json
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "data");
mkdirSync(outDir, { recursive: true });

/* ---------------- 确定性伪随机（mulberry32） ---------------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussNoise(rand) {
  const u = Math.max(rand(), 1e-12), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ---------------- 超声 A-scan 合成 ----------------
 * 时间轴：0–9.975 µs，dt = 0.025 µs（等效采样率 40 MS/s），N = 400。
 * 回波模型：高斯调制余弦脉冲串（中心频率 5 MHz）。
 *   完好：主脉冲 + 上蒙皮表面回波 + 芯层界面弱回波 + 底面回波。
 *   冲击损伤：出现夹层/压溃附加回波与振铃，底面回波衰减并延迟。
 *   穿孔：孔壁多次反射，底面回波基本消失。
 *   修复后：修补界面弱回波，底面回波大部分恢复。
 */
const US = { dt: 0.02, n: 512, fc: 5.0, pulseWidth: 0.32 };
const timeUs = Array.from({ length: US.n }, (_, i) => +(i * US.dt).toFixed(2));

function toneBurst(t, t0, amp, width = US.pulseWidth, fc = US.fc) {
  const x = (t - t0) / width;
  return amp * Math.exp(-x * x) * Math.cos(2 * Math.PI * fc * (t - t0));
}

/** echoes: [t0_us, amp, width?] */
function synthesizeAscan(echoes, seed, noiseSigma = 0.012) {
  const rand = mulberry32(seed);
  const out = new Float64Array(US.n);
  for (let i = 0; i < US.n; i++) {
    const t = i * US.dt;
    let v = 0;
    for (const [t0, amp, w] of echoes) v += toneBurst(t, t0, amp, w ?? US.pulseWidth);
    v += noiseSigma * gaussNoise(rand);
    out[i] = v;
  }
  return out;
}

/** 基于 FFT 解析信号（Hilbert）的包络，随后做 5 点滑动平均。 */
function hilbertEnvelope(input) {
  const m = input.length;
  const n = 2 ** Math.ceil(Math.log2(m)); // FFT 需要 2 的幂，不足则零填充
  const re = new Array(n).fill(0), im = new Array(n).fill(0);
  for (let i = 0; i < m; i++) re[i] = input[i];
  fft(re, im, false);
  for (let k = 0; k < n; k++) {
    const m = k === 0 || k === n / 2 ? 1 : k < n / 2 ? 2 : 0;
    re[k] *= m; im[k] *= m;
  }
  fft(re, im, true);
  const env = new Float64Array(m);
  for (let i = 0; i < m; i++) env[i] = Math.hypot(re[i], im[i]);
  const sm = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    let s = 0, c = 0;
    for (let j = -2; j <= 2; j++) {
      const k = i + j;
      if (k >= 0 && k < m) { s += env[k]; c++; }
    }
    sm[i] = s / c;
  }
  return sm;
}

function fft(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1, cwi = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j], ui = im[i + j];
        const vr = re[i + j + len / 2] * cwr - im[i + j + len / 2] * cwi;
        const vi = re[i + j + len / 2] * cwi + im[i + j + len / 2] * cwr;
        re[i + j] = ur + vr; im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
        [cwr, cwi] = [cwr * wr - cwi * wi, cwr * wi + cwi * wr];
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

const round4 = (arr) => Array.from(arr, (v) => +v.toFixed(4));

/* 各状态下 6 个测点的回波配置。测点沿一条直线穿越损伤区。 */
const usPointPlan = {
  intact: [
    { status: "intact", label_zh: "完好区", echoes: [[0.15, 0.35], [1.2, 1.0], [2.6, 0.07], [3.1, 0.05], [7.2, 0.46]] },
    { status: "intact", label_zh: "完好区", echoes: [[0.15, 0.35], [1.2, 1.0], [2.6, 0.07], [3.1, 0.05], [7.2, 0.44]] },
    { status: "intact", label_zh: "完好区", echoes: [[0.15, 0.35], [1.2, 1.0], [2.6, 0.07], [3.1, 0.05], [7.2, 0.45]] },
    { status: "intact", label_zh: "完好区", echoes: [[0.15, 0.35], [1.2, 1.0], [2.6, 0.07], [3.1, 0.05], [7.2, 0.43]] },
    { status: "intact", label_zh: "完好区", echoes: [[0.15, 0.35], [1.2, 1.0], [2.6, 0.07], [3.1, 0.05], [7.2, 0.45]] },
    { status: "intact", label_zh: "完好区", echoes: [[0.15, 0.35], [1.2, 1.0], [2.6, 0.07], [3.1, 0.05], [7.2, 0.44]] }
  ],
  impact: [
    { status: "intact", label_zh: "完好区", echoes: [[0.15, 0.35], [1.2, 1.0], [2.6, 0.07], [3.1, 0.05], [7.2, 0.45]] },
    { status: "suspected", label_zh: "损伤过渡区", echoes: [[0.15, 0.35], [1.2, 1.0], [2.6, 0.08], [4.1, 0.22], [4.9, 0.08], [7.3, 0.30]] },
    { status: "damage", label_zh: "芯层压溃/脱粘", echoes: [[0.15, 0.35], [1.2, 1.0], [4.1, 0.52], [4.85, 0.20], [5.6, 0.09], [7.45, 0.13]] },
    { status: "damage", label_zh: "芯层压溃/脱粘", echoes: [[0.15, 0.35], [1.2, 1.0], [4.05, 0.50], [4.8, 0.19], [5.55, 0.09], [7.4, 0.14]] },
    { status: "suspected", label_zh: "损伤过渡区", echoes: [[0.15, 0.35], [1.2, 1.0], [2.6, 0.08], [4.15, 0.21], [4.95, 0.08], [7.3, 0.29]] },
    { status: "intact", label_zh: "完好区", echoes: [[0.15, 0.35], [1.2, 1.0], [2.6, 0.07], [3.1, 0.05], [7.2, 0.44]] }
  ],
  perforation: [
    { status: "intact", label_zh: "完好区", echoes: [[0.15, 0.35], [1.2, 1.0], [2.6, 0.07], [3.1, 0.05], [7.2, 0.45]] },
    { status: "suspected", label_zh: "孔边过渡区", echoes: [[0.15, 0.35], [1.2, 1.0], [2.0, 0.28], [2.9, 0.18], [7.3, 0.10]] },
    { status: "damage", label_zh: "穿孔区（无底面回波）", echoes: [[0.15, 0.35], [1.2, 1.08, 0.4], [1.9, 0.34], [2.75, 0.24], [3.6, 0.15], [4.5, 0.08]] },
    { status: "damage", label_zh: "穿孔区（无底面回波）", echoes: [[0.15, 0.35], [1.2, 1.06, 0.4], [1.95, 0.33], [2.8, 0.23], [3.65, 0.14], [4.55, 0.08]] },
    { status: "suspected", label_zh: "孔边过渡区", echoes: [[0.15, 0.35], [1.2, 1.0], [2.05, 0.27], [2.95, 0.17], [7.3, 0.10]] },
    { status: "intact", label_zh: "完好区", echoes: [[0.15, 0.35], [1.2, 1.0], [2.6, 0.07], [3.1, 0.05], [7.2, 0.44]] }
  ],
  repaired: [
    { status: "intact", label_zh: "完好区", echoes: [[0.15, 0.35], [1.2, 1.0], [2.6, 0.07], [3.1, 0.05], [7.2, 0.45]] },
    { status: "intact", label_zh: "修复区（界面回波可见）", echoes: [[0.15, 0.35], [1.2, 1.0], [2.1, 0.11], [2.6, 0.06], [7.2, 0.38]] },
    { status: "intact", label_zh: "修复区（界面回波可见）", echoes: [[0.15, 0.35], [1.2, 1.0], [2.15, 0.14], [2.65, 0.06], [7.25, 0.36]] },
    { status: "intact", label_zh: "修复区（界面回波可见）", echoes: [[0.15, 0.35], [1.2, 1.0], [2.12, 0.13], [2.62, 0.06], [7.22, 0.37]] },
    { status: "intact", label_zh: "修复区（界面回波可见）", echoes: [[0.15, 0.35], [1.2, 1.0], [2.08, 0.11], [2.6, 0.06], [7.2, 0.38]] },
    { status: "intact", label_zh: "完好区", echoes: [[0.15, 0.35], [1.2, 1.0], [2.6, 0.07], [3.1, 0.05], [7.2, 0.44]] }
  ]
};

const scanPositions = [10, 30, 50, 70, 90, 110]; // mm，抽象演示坐标
const usStates = {};
for (const [state, plan] of Object.entries(usPointPlan)) {
  usStates[state] = {
    points: plan.map((p, i) => {
      const raw = synthesizeAscan(p.echoes, 1000 + i * 97 + state.length * 13);
      const envelope = hilbertEnvelope(raw);
      return {
        id: `P${i + 1}`,
        x_mm: scanPositions[i],
        status: p.status,
        label_zh: p.label_zh,
        raw: round4(raw),
        envelope: round4(envelope)
      };
    })
  };
}

const ultrasonicJson = {
  schema_version: "1.0",
  dataset_name: "Repair Workflow ultrasonic A-scan demonstration set",
  classification: "Demonstration data / 演示数据",
  is_synthetic: true,
  disclaimer: "确定性合成演示信号：用于展示 A-scan + Hilbert 包络的损伤判读流程。不来自真实试件或仪器，不代表检测精度、缺陷尺寸或工程判据。生成器：tools/generate-demo-data.mjs（固定随机种子）。",
  physics: {
    wave_type: "ultrasonic elastic wave (longitudinal, pulse-echo)",
    center_frequency_MHz: US.fc,
    sampling_MS_per_s: 50,
    window_us: 10.24,
    envelope_method: "Hilbert analytic signal (magnitude), 5-point moving average",
    note_zh: "回波到达时间反映界面深度；损伤区出现附加回波且底面回波衰减。"
  },
  scan: { path: "single line", point_spacing_mm: 20, points_mm: scanPositions },
  time_us: timeUs,
  states: usStates
};
writeFileSync(join(outDir, "ultrasonic-demo.json"), JSON.stringify(ultrasonicJson));

/* 自检：完好点包络峰值应接近表面回波幅值 1.0，且位于 1.2 µs 附近 */
{
  const p = usStates.intact.points[0];
  let pk = 0, pi = 0;
  p.envelope.forEach((v, i) => { if (v > pk) { pk = v; pi = i; } });
  console.log(`[自检] intact P1 包络峰值=${pk.toFixed(3)} @ ${(pi * US.dt).toFixed(2)} µs（期望 ≈1.0 @ 1.2 µs）`);
}

/* ---------------- 电磁 S11 演示曲线 ----------------
 * 频段 8–12 GHz，201 点。单端口反射（S11，dB）。
 * 曲线形态仅为演示：宽带吸波凹陷 + 轻微波纹；不声称来自 CST 或实测。
 */
const EM = { f0: 8, f1: 12, n: 201 };
const freqGHz = Array.from({ length: EM.n }, (_, i) => +(EM.f0 + (i * (EM.f1 - EM.f0)) / (EM.n - 1)).toFixed(2));
const g1 = (f, mu, s) => Math.exp(-(((f - mu) / s) ** 2));

function s11Base(f) {
  return -13.2 - 2.4 * g1(f, 10.15, 1.35) + 0.3 * Math.sin((2 * Math.PI * (f - 8)) / 1.15) - 0.12 * (f - 10);
}
const emStateModels = {
  intact: {
    curves: [
      { id: "C1", position_zh: "测试区中心", offset: 0.0, dipScale: 1.0, ripple: 0.05 },
      { id: "C2", position_zh: "测试区边缘", offset: 0.15, dipScale: 1.0, ripple: 0.05 },
      { id: "C3", position_zh: "远离测试区", offset: 0.1, dipScale: 1.0, ripple: 0.05 }
    ],
    anomaly: { amp: 0.05, sx: 3.0, sy: 2.0 }
  },
  impact: {
    curves: [
      { id: "C1", position_zh: "损伤区中心", offset: 2.2, dipScale: 0.55, ripple: 0.5 },
      { id: "C2", position_zh: "损伤区边缘", offset: 1.1, dipScale: 0.8, ripple: 0.25 },
      { id: "C3", position_zh: "远离损伤区", offset: 0.15, dipScale: 1.0, ripple: 0.05 }
    ],
    anomaly: { amp: 0.75, sx: 2.2, sy: 1.6 }
  },
  perforation: {
    curves: [
      { id: "C1", position_zh: "穿孔区中心", absolute: (f) => -7.6 - 1.1 * g1(f, 10.0, 2.1) + 0.8 * Math.sin((2 * Math.PI * (f - 8)) / 0.9), ripple: 0 },
      { id: "C2", position_zh: "穿孔区边缘", offset: 3.4, dipScale: 0.6, ripple: 0.45 },
      { id: "C3", position_zh: "远离穿孔区", offset: 0.2, dipScale: 1.0, ripple: 0.05 }
    ],
    anomaly: { amp: 0.95, sx: 1.4, sy: 1.1 }
  },
  repaired: {
    curves: [
      { id: "C1", position_zh: "修复区中心", offset: 0.5, dipScale: 0.95, ripple: 0.1, step: { mu: 9.0, sigma: 0.22, amp: 0.8 } },
      { id: "C2", position_zh: "修复区边缘", offset: 0.3, dipScale: 0.98, ripple: 0.08, step: { mu: 9.0, sigma: 0.22, amp: 0.5 } },
      { id: "C3", position_zh: "远离修复区", offset: 0.12, dipScale: 1.0, ripple: 0.05 }
    ],
    anomaly: { amp: 0.18, sx: 2.6, sy: 1.8 }
  }
};

function emCurve(spec, seed) {
  const rand = mulberry32(seed);
  return freqGHz.map((f) => {
    let v;
    if (spec.absolute) v = spec.absolute(f);
    else {
      const dip = -2.4 * g1(f, 10.15, 1.35);
      v = -13.2 + dip * spec.dipScale + 0.3 * Math.sin((2 * Math.PI * (f - 8)) / 1.15) - 0.12 * (f - 10) + spec.offset;
      if (spec.ripple) v += spec.ripple * Math.sin((2 * Math.PI * (f - 8)) / 0.53 + 1.1);
      if (spec.step) v += spec.step.amp * g1(f, spec.step.mu, spec.step.sigma);
    }
    return +(v + 0.06 * gaussNoise(rand)).toFixed(3);
  });
}

function emMap(spec, seed) {
  const nx = 12, ny = 8, rand = mulberry32(seed);
  const cx = (nx - 1) / 2, cy = (ny - 1) / 2;
  const values = [];
  for (let y = 0; y < ny; y++)
    for (let x = 0; x < nx; x++) {
      const d = ((x - cx) ** 2) / (2 * spec.anomaly.sx ** 2) + ((y - cy) ** 2) / (2 * spec.anomaly.sy ** 2);
      const v = 0.04 + spec.anomaly.amp * Math.exp(-d) + 0.03 * gaussNoise(rand);
      values.push(+Math.min(1, Math.max(0, v)).toFixed(3));
    }
  return { nx, ny, values };
}

const emStates = {};
Object.entries(emStateModels).forEach(([state, spec], si) => {
  emStates[state] = {
    curves: spec.curves.map((c, ci) => ({ id: c.id, position_zh: c.position_zh, s11_db: emCurve(c, 4000 + si * 131 + ci * 17) })),
    response_map: emMap(spec, 7000 + si * 53)
  };
});

const emJson = {
  schema_version: "1.0",
  dataset_name: "Repair Workflow electromagnetic probe demonstration set",
  classification: "Demonstration data / 演示数据 · Concept Demonstrator / 概念演示",
  is_synthetic: true,
  disclaimer: "确定性合成演示曲线：展示波导探头扫描与 S11 判读流程。不代表真实探头测量、校准结果或近远场变换输出。生成器：tools/generate-demo-data.mjs（固定随机种子）。",
  probe: {
    type: "open-ended rectangular waveguide probe (concept demonstrator)",
    architecture: "single-port reflection, S11 only（单端口反射架构，仅 S11；不含 S21 通道）",
    band_GHz: [EM.f0, EM.f1]
  },
  frequency_GHz: freqGHz,
  reference_curve: {
    id: "REF",
    position_zh: "完好区参考",
    s11_db: emCurve({ offset: 0, dipScale: 1.0, ripple: 0.05 }, 9001)
  },
  states: emStates,
  processing_flow: [
    { key: "scan", en: "Waveguide Probe Scanning", zh: "波导探头扫描" },
    { key: "calibrate", en: "Calibration / De-embedding", zh: "校准与端口去嵌" },
    { key: "nearfield", en: "Near-field Response Map", zh: "近场响应重建" },
    { key: "ntff", en: "Near-to-Far-Field Transformation", zh: "近远场变换" },
    { key: "rcs", en: "RCS / EM Performance Evaluation", zh: "RCS 或电磁性能评价" }
  ],
  flow_note_zh: "该流程为技术路线示意：网页不执行实时近远场数值计算，评价输出为概念性示例。"
};
writeFileSync(join(outDir, "electromagnetic-demo.json"), JSON.stringify(emJson));

console.log("[完成] 已生成 ultrasonic-demo.json 与 electromagnetic-demo.json");
