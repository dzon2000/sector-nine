# ADR-0008 — Chapter IV priority routing and mission rules

**Status** — Accepted by Product Owner on 2026-11-18 after review of the paid feasibility results. Prototype and paid layouts appear in [WP2 experiments](../validation/v0.6-wp2-probes.md).

## Decision

Keep splitters alternating by default. Add an optional forward or clockwise priority relative to the splitter's facing. A mode change updates selection at the command boundary and leaves cargo movement to the next engine tick. Preserve the alternating rotor while priority is active so returning to alternating resumes its previous selection. Rotate both local outlets with the splitter. Persist mode and selection in the current-version save under ADR-0006.

Keep existing transfer snapshot eligibility and arbitration. Try the other outlet if the preferred one is missing, occupied at the planning snapshot, or rejects the cargo. Hold the item when both outlets reject it. If another source wins arbitration after the preferred request was accepted, hold the cargo until the next tick. Retrying after arbitration would change contested-target ordering and requires a separate arbitration prototype. Test current-version save/restore, pending cargo on mode change, all rotations, fallback, and existing alternation at the production gate.

Keep the same mission measurements across both recipient routes. M14 uses a full post-activation 30-tick window with at least six fresh circuit completions, six circuit sales and at most five consecutive ticks without a circuit sale. A prepared factory can qualify in the first full window. Count physical production and sales independently.

### M15 revision approved after owner playtest

The previous gear and circuit goals completed without intervention on the owner's prepared M13 factory. M15 now accepts three raw copper ore sales at the terminal after M15 begins. Starting on the tick after the third sale, qualify for the same circuit continuity goal as M14 in a fresh rolling window. The shipment tick cannot contribute circuit evidence to that window. Progress comes from physical terminal sales and production. Different factory layouts can qualify without an edit or a specific splitter action. Neither stage injects faults or changes prices, transfer rules or terminal capacity. Chapter IV grants one station reply after recovery.

The paid Independent and Corporate feasibility replays passed the staged goal in 72 and 59 ticks respectively. Each reference solution replaces one conveyor with a splitter for 5.25 Cr net, then switches priority once. Unchanged reference factories ship no raw copper. The fixed simulated priorities fail one of the stages.
