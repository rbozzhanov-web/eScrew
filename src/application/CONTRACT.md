# UI integration contract

The UI consumes normalized roster data only after the integration boundary. AIMS DOM, protocol, leg identifiers, raw DTOs and authentication/session material are not application/UI dependencies.

This branch is intentionally based on PR #45 (`core/aims-normalized-contract`). After #45 merges, retarget/rebase this UI PR onto `main` and keep only the application/UI compatibility changes.

Crew remains optional. The normalized/Core model supports it, but the current AIMS bridge path in PR #45 does not yet populate crew, so the compatibility projection does not invent crew data.
