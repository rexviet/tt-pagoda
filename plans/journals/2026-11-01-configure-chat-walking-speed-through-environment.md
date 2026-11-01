---
title: Configure chat walking speed through environment
date: 2026-11-01
summary: Add CHAT_WALK_SPEED while retaining the five-second chat movement window and return to side positions.
---

# Configure chat walking speed through environment

## What happened

Added positive numeric `CHAT_WALK_SPEED` configuration, defaulting to 420 design pixels per second. `/api/config` exposes the setting, and the overlay loads it even with an explicit outfits query. Chat wandering uses the configured speed and limits each random step to leave time for the return home within its five-second window. Sub-pixel moves yield to the renderer. Updated `.env.example`, README and regression checks.

## Verification

Passed API configuration checks for defaults, positive overrides, zero, negative, invalid and infinite inputs. Passed movement-events with a custom speed. The real Chrome overlay-movement regression passed at CHAT_WALK_SPEED=120 with explicit outfits, including renderer configuration, chat duration and repeated chat, return home, gift routing, top-six movement, two-frame walking, resets and queue retention. No browser exceptions were recorded. A separate ad-hoc browser probe stalled and was terminated; its result was excluded. Syntax and whitespace checks passed.

## Next steps

Set CHAT_WALK_SPEED in `.env`, restart the server and reload the overlay. The chat duration remains five seconds from the latest message.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
