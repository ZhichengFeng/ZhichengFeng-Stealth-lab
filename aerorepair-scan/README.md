# AeroRepair Scan · Stealth Lab Module 09

This directory is the GitHub Pages-native integration of AeroRepair Scan.

## Architecture decision

Stealth Lab is published as a static vinext build, while the original AeroRepair Scan application uses a Python/Gradio backend. The selected integration is therefore a browser-native static port rather than an iframe or a bundled Python runtime.

The port keeps the project narrative, high-resolution equipment imagery, six deterministic synthetic scenarios, frequency/polarization/standoff controls, scan animation, heatmap, assessment metrics, and summary. It does not publish the Python runtime, private calibration logic, real measurements, or validated engineering thresholds.

## Files

- `index.html`: semantic module page and Stealth Lab lifecycle bridge.
- `styles.css`: responsive visual system aligned with the main laboratory.
- `app.js`: deterministic browser-side concept simulation.
- `data/demo_cases.json`: scenario definitions copied from the reviewed AeroRepair baseline.
- `assets/*.webp`: optimized public-facing concept imagery.
- `module-manifest.json`: source and integration provenance.

The main Stealth Lab build loads `assets/aerorepair-entry.js`, which adds discoverable entry points without modifying the minified React/vinext application bundle.

## Product boundary

All interactive values are synthetic demonstration outputs. The module does not connect to a probe, VNA, positioning system, digital twin, validated inversion model, or engineering acceptance criteria.
