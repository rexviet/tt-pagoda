---
title: Prioritize altar animation for top six
date: 2026-11-01
summary: "Top-six donors always receive the altar shot and zoom, regardless of cumulative coin divisibility."
---

# Prioritize altar animation for top six

## What happened

Added top-six priority to the gift route in `server.js`. Ranking is evaluated after adding the gift, so newly promoted users also qualify. The overlay rechecks the current cushion assignment when a queued prayer starts and returns the disciple to its assigned cushion afterward. Ordinary viewers retain the cumulative multiple-of-five rule.

## Verification

Passed `movement-events-test.js`, real Chrome `overlay-movement-test.js`, and the impatient `overlay-queue-test.js`. Covered non-VIP totals 1/5/6, VIP promotion at total 106, another VIP prayer at 107, return to the correct cushion, chat movement, and queue retention. No browser exceptions were recorded. Updated README and seeded regression scenarios with existing VIPs to keep non-VIP cases meaningful. Syntax and whitespace checks passed.

## Next steps

Restart the Node server and reload the overlay. Real TikTok room verification remains outside the local checks.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
