---
title: Apply cumulative milestones only to one-coin gifts
date: 2026-11-01
summary: Larger gift unit prices always enable the altar shot; one-coin gifts retain cumulative milestone routing.
---

# Apply cumulative milestones only to one-coin gifts

## What happened

Preserved `perUnit` from TikTok gifts through the shared gift handler and supplied it for admin simulations. The altar condition now accepts top-six users, gifts priced above one coin per unit, or cumulative totals divisible by five. Bundled one-coin gifts still use the cumulative rule. Updated README and regression cases.

## Verification

Passed movement-events, TikTok event handlers and the real Chrome overlay-movement regression. Covered mixed gift prices, bundled one-coin gifts, a non-VIP receiving a 50-coin gift at cumulative total 56, and VIP prayers at totals 106/107. No browser exceptions were recorded. JavaScript syntax and whitespace checks passed.

## Next steps

Restart the server and reload the overlay to apply the updated event routing.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
