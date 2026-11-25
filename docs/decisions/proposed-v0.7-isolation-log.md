# Draft ADR — Chapter V Isolation Log mission rules

**Status** — Proposed. Product Owner approval pending. WP4 supports review with headless evidence. WP5 requires a separate authorization.
**References** — [v0.7 specification](../specifications/v0.7.md), [WP4 results](../validation/v0.7-wp4.md), [ADR-0006](0006-development-save-policy.md), [ADR-0008](0008-return-signal.md).

## Proposed decision

Use the same physical factory conditions for Independent and Corporate. M15 completion offers Chapter V through the existing progression. Starting Chapter V activates M16 and starts fresh measurement on the following active tick.

| Mission | Full active ticks per block | Consecutive qualifying blocks | Gear made and sold, each | Circuit made and sold, each | Max consecutive active ticks without a circuit sale |
| --- | ---: | ---: | ---: | ---: | ---: |
| M16 · Open the Bypass | 30 | 1 | 5 | 6 | 5 |
| M17 · Hold the Channel | 30 | 2 | 9 | 7 | 4 |

Each block begins immediately after activation or the last complete block. Measure disjoint blocks. The console can show progress and gaps as the current block fills, then qualify it only after its final tick. Count factory completions and terminal sales independently, using physical events from that block. Carried stock can supplement terminal deliveries, but it cannot satisfy the fresh-production counts. Production held off the terminal cannot satisfy the sales counts.

Count consecutive circuit-sale-free ticks from the first tick of the stage, including both block edges. Carry an unfinished dry run to the next block. The previous drought counts toward the new block only if a dry tick in the new block continues it. A sale on the opening tick ends the run immediately. Count a failed block as zero consecutive qualifying blocks and keep measuring. M16's completion tick belongs to M16. M17 starts measurement on the following active tick with fresh counters and a zero dry run. Pause, absence, and save/reload leave measurement untouched until the next real engine tick.

Both routes can adjust one local conversion branch and keep their main conveyor trunk and terminal. Use thresholds to judge the factory. Permit preplanned layouts, alternative routes and temporary resource trades. Keep normal recipes, throughput, research, prices, costs and terminal capacity. The feasibility replays use an existing assembler and routing, with no mission-mandated edit, deadline, fee, payout, new research or injected factory fault.

Retain the approved narrative sequence. M16 completion reveals the operator-triggered interlock. M17 completion archives the downstream isolation log once and returns to free play. Independent receives the maintenance transmission and Corporate receives the equivalent service ticket. WP5 will specify and test typed current-version evidence, stage/route validation, progression, archive persistence and reload at each boundary.

## Why this variant

Both unchanged factories satisfied the earlier modest gear-plus-circuit goal immediately. Raising circuit cadence alone creates a legitimate zero-cost adjustment on Independent and recognizes Corporate's steady by-design cadence, but leaves no new routing decision for the Corporate reference factory. A nine-gear floor creates useful pressure for both while leaving circuit service running. The one-tile reference conversion trades steel production for more gear throughput and retains the existing electronics freight. Players may meet the target in any eligible way.

Both converted paid layouts met the ten-gear comparison on the same aligned blocks. Nine keeps a unit of headroom at the observed steady minimum. A third qualifying block required 30 more active ticks in each trace without demonstrating another local routing constraint. Prepared factories qualified in 60 ticks, with 90 observed from both reference factories after an immediate edit, including delivery buildup. The [validation report](../validation/v0.7-wp4.md) contains costs, timing and independent flow failures.
