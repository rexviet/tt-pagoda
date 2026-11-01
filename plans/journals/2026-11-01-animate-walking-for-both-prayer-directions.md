---
title: Animate walking for both prayer directions
date: 2026-11-01
summary: Replace fade-and-teleport returns with visible two-frame walking for prayers and cushion changes.
---

# Animate walking for both prayer directions

## What happened

The overlay used `walkup`/`walkup2` only when moving upward. Other directions selected a missing front-facing walk sprite, and return/relocation helpers explicitly faded figures out before repositioning them. Updated all walking directions to alternate the bundled two back-view walking frames. Removed movement fades, slowed prayer travel to 420 design pixels per second, ensured short trips have enough time for multiple footsteps, and reduced body sway. Kept the praying figure in the visible hero layer until its return completes so camera/crowd transitions cannot hide it.

## Verification

Passed real Chrome overlay-movement, overlay-pose-size and overlay-vip regressions. New observations sample both prayer legs to verify both frame poses appear, positions change continuously, opacity stays above 0.95, and the figure returns to its cushion. Existing checks covered chat, gift routing, resets, queue retention and ranking overtakes. No browser exceptions were recorded; syntax and whitespace checks passed. README documents reuse of the existing back-view frames.

## Next steps

Reload the overlay to load the updated client script. No server restart is required for this client-only change.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
