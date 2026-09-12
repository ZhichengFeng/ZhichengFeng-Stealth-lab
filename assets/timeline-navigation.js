/*
 * Static distribution adapter for exact stage navigation.
 * The generated module exports the shared timeline as `i` and stage data as `r`.
 * GSAP rounds timeline time, so a fractional stage start can land just before
 * its boundary. Seek 1 ms inside the requested stage using its existing data.
 * When rebuilding from source, implement the same offset in TimelineDock.tsx
 * and remove this adapter, or update the import to the new generated module.
 */
import { i as timeline, r as stages } from './publicAsset-DgTuthEm.js';

document.addEventListener('click', event => {
  const button = event.target instanceof Element ? event.target.closest('.stage-labels button') : null;
  if (!button) return;
  const index = [...button.parentElement.children].indexOf(button);
  const stage = stages[index];
  if (!stage) return;
  event.preventDefault();
  event.stopPropagation();
  const seconds = stage.index === 0 ? 0 : stage.start + Math.min(0.001, (stage.end - stage.start) / 2);
  timeline.seek(seconds / stages[stages.length - 1].end);
}, true);
