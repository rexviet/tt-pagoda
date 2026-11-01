---
title: Add a top-six simulation preset
date: 2026-11-01
summary: Add an admin button that starts a test session with six seated users at exactly 100 points each.
---

# Add a top-six simulation preset

## What happened

Added the admin button “Giả Lập Top 6 — Mỗi Người 100 Điểm” and a `sim:top6` socket handler. The preset resets the session and creates stable users Top 1 through Top 6 at 100 points each, broadcasting the ranking without generating gift/festival effects. The admin selects Top 1 for immediate gift simulation. Repeated clicks restore the same six users to 100 points. Reused a shared session-reset helper and documented the preset's reset behavior.

## Verification

The event regression passed exact scores/order, stable identities, gift continuation and repeated seeding checks. A real Chrome check clicked the new admin button, verified all six cushion occupants, used the regular gift button to raise Top 1 to 101 and play its prayer, and clicked the preset again to restore 100 points. No browser exceptions were recorded. Screenshot, JavaScript syntax and whitespace checks completed.

## Next steps

Restart the server and reload admin/overlay to use the new button.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
