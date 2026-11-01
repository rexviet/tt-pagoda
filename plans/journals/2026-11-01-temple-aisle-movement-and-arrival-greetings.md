---
title: Temple aisle movement and arrival greetings
date: 2026-11-01
summary: "Reserve the center aisle, route prayers by cumulative coins, add chat wandering and arrival greetings."
---

# Temple aisle movement and arrival greetings

## What happened

Updated `server.js` to emit cumulative coin totals and altar milestones, track the latest received gift (including unsettled streaks), and greet arrivals after two quiet seconds. Updated `public/overlay.js` to reserve the center aisle, route ordinary prayers into it, retain earned altar visits through queue limits, and return wandering chatters to their side or VIP cushion after five seconds. Movement cancellation keeps chat, gifts and ranking changes from competing for a figure.

## Decision

An altar milestone requires the resulting cumulative total to be exactly divisible by five. Queued gifts from the same person retain an earned altar visit. Existing fortune cards, rankings and TTS providers remain in use. Arrival greetings obey the voice toggle. Updated README and regression scripts.

## Verification

Passed movement-events, real Chrome overlay-movement, TikTok event handlers, speech-name, overlay-leave, overlay-vip, overlay-board and impatient overlay-queue checks. Browser checks covered repeated chat, chat during prayers, reset during movement/ceremonies, and queue overflow. No browser exceptions were recorded. JavaScript syntax and git diff whitespace checks passed. New tests stub synthesis; no real live-room or end-to-end provider audio verification was performed.

## Next steps

Restart the server and reload the overlay to use the changes; verify the welcome voice in the intended streaming host.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
