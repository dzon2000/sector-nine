# ADR-0007 — Project Prometheus contract rules

**Status:** Accepted by Product Owner on 2026-11-16.  
**Scope:** Chapter III of v0.5.  
**Evidence:** [WP2 paid campaign probes](../validation/v0.5-wp2.md).

## Decision

Use the four frozen profiles in the [v0.5 specification](../specifications/v0.5.md). Start Chapter III explicitly after M10. Accept M11, choose and explicitly confirm one M12 route, accept M12, then accept the shared M13. Completion grants the associated archive entry and access to the next step once. Both routes grant the same progression access. Rewards have no cash or inventory effect. Completion returns the player to free play.

At acceptance, record the current simulation tick. For each subsequent active tick, finish normal simulation including production, transport, sales, operating ledger and power accounting before evaluating the contract. Record only accepted-contract samples. Evaluate the latest 60 complete samples together. Check newly made and sold quantities independently, covered positive-demand ticks, generator coal burns and operating profit as applicable. Count one qualifying window per active tick and reset the streak on failure. Complete on the tick the streak reaches 30. Paused simulation makes no progress.

Persist the confirmed route, completed contract sequence and active contract with activation tick, trailing samples and streak. The ordered completion sequence is the source of truth for archive rewards and offer access. Older in-development snapshots from before Chapter III may validly have no Chapter III state. A present Chapter III state is validated as current-format game data.

M13 reconstructs a mechanical interlock recovered through either investigation route. It requires a gear-heavy product mix while sustaining circuits and steel. The paid reference layouts can adapt in limited areas. A player who plans ahead can qualify on fresh output without artificial construction requirements.

## Consequences

Existing recipes, prices, balances, power mechanics, map and terminal behavior remain unchanged. WP3 proves headless command, accounting, progression and restore behavior. Contract UI and authored narrative follow in WP4 and WP5. Human evaluation of decision time, narrative and layout difficulty remains part of WP6.
