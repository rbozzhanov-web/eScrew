# Application roster boundary

`importNormalizedRoster()` is the source-agnostic application entry point for normalized roster imports. UI code must not import AIMS engine/parser/protocol modules. The current `MainScreen` remains on the existing storage projection until its roster state is migrated to the normalized Core model; `upsertStoredRoster()` accepts `NormalizedRoster` at that compatibility boundary so AIMS import remains functional without a second UI roster implementation.
