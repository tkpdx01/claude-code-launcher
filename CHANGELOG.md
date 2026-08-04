# Changelog

## 2.2.1 - 2026-08-04

### Fixes

- Prevent stale `model_catalog_json` files from silently overriding Codex's bundled metadata when profiles switch to newer models.
- Validate catalog/profile consistency during launch, model changes, and `ccc doctor`; remove incompatible overrides safely through `ccc apply` while preserving compatible custom catalogs.

## 2.2.0

- Rebuilt launch parsing as a transparent Claude/Codex argument proxy.
- Kept `-d` as CCC full-access mode with current upstream flags.
- Added versioned private profile storage, atomic writes, masked secrets, and runtime cleanup.
- Preserved normal Codex state by using invocation-scoped provider overrides.
- Added dynamic model discovery, arbitrary model IDs, model catalog, and model commands.
- Fixed Codex TOML root semantics and DeepSeek model selection.
- Added safe apply preview, backups, rollback, and strict configuration parsing.
- Added `ccc doctor`, a redesigned interactive UI, cross-platform spawning, CI, and package allowlisting.
