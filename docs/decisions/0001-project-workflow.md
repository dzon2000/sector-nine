# ADR-0001 — Repository and Version Workflow

**Date:** 2026-11-08  
**Status:** accepted

## Context

SEKTOR 9 will evolve incrementally through multiple AI-assisted implementation sessions. Mixing design discussion with code implementation across versions risks contradictory requirements and lost context.

## Decision

- GitHub repository `dzon2000/sector-nine` is the canonical store for code, decisions, and documentation.
- All repository documentation, code identifiers, and comments are English.
- A dedicated ChatGPT conversation covers brainstorming, economy, narrative, and future specifications.
- Each game version is implemented in its own separate ChatGPT conversation against a committed specification.
- The approved stack is TypeScript, React, PixiJS, Vite, Vitest, and IndexedDB.
- Development changes should be made on version/feature branches and reviewed before merge into `develop`.
- The initial repository commit sets up documentation and placeholders only; gameplay implementation is deferred until the simulation assumptions have been validated.

## Consequences

Specifications have explicit paths and ownership; implementation agents begin with known source files. Design revisions are recorded as ADRs or specification changes rather than inserted silently into source code.
