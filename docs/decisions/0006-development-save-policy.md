# ADR-0006 — Current-Version Saves During Active Development

**Date:** 2026-11-15  
**Status:** ACCEPTED — Product Owner explicitly requested removal of legacy-save compatibility and a v0.5 work package. Runtime policy implemented in v0.5 WP1.  
**Applies:** v0.5 onward, until explicitly superseded. Released v0.4 behavior is unchanged by this documentation commit.

## Decision

Support saves created by the current game version only. Do not maintain migration chains, grandfathered historical mission evaluators or archived-save acceptance gates for earlier releases. The owner starts fresh campaigns during active development; maintaining these paths adds unnecessary implementation and testing overhead.

- A fresh current-version campaign must save and restore throughout every supported chapter, including M1–M10 and later content. Preserve cash, goods, machine cycles, arbitration/fuel state, research, mission windows/streaks, choices and completion state deterministically.
- Use one current save format across the whole campaign. Separate save-format identity from chapter/mission progression; do not require loading an old schema to play Chapter I or enter Chapter II.
- Retain explicit schema/rule/build identifiers where useful for validation and recorder provenance. Removing legacy behavior does not mean removing version metadata or lying about build identity.
- Reject unsupported, future or malformed snapshots clearly. Do not attempt migration, silently overwrite the stored snapshot, or let autosave replace it before the player explicitly chooses **Start new game**. Cancel/reload preserves the original data. No archive manager, import/export feature or migration framework is required.
- Preserve current-version autosave serialization, write ordering, error reporting and reload determinism. This decision is not permission to make saves generally unreliable.
- Development snapshots may become unsupported after a declared format/rule break. Document the required restart and increment the compatibility identifier; once v0.5 is frozen, v0.5 save support is a release requirement. Do not use commit SHA as a mandatory exact-build load lock.
- Keep current gameplay/economy regression coverage. Remove only compatibility-specific branches and tests; rebuild useful historical mechanic fixtures with the current initializer. Original M6/M7 cumulative rules for legacy saves may be removed; current fresh-campaign sustained-throughput rules remain unchanged.

## Authority and supersession

This decision supersedes cross-version save preservation, historical mission-rule coexistence and mandatory manual migration evidence in AGENTS.md, studio instructions and v0.1–v0.4 specifications/ADRs/backlogs **for v0.5 and subsequent development**. Historical documents retain their original version scope and evidence. No historical test result or human acceptance is retroactively changed.

Implementation is [v0.5 WP1](../implementation/v0.5-tasks.md). This policy is approved; the rest of the v0.5 gameplay proposal is not automatically approved.

## Reintroduction

Compatibility is deferred without a release date. Before broader player distribution or a promise of durable long-term campaigns, revisit it through a new approved ADR and version specification. Decide the supported version range, migration/backup policy, real archived-save evidence and failure behavior then. Do not keep unused migration infrastructure in anticipation of that decision.
