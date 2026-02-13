# Dependency Audit (2026-02-13)

This audit was run from the project workspace with `cargo info` and cross-checked with official crate documentation/repositories.

## Current dependency set

- `clipper2-rust` `1.0.0`
- `wasm-bindgen` `0.2.108`
- `serde` `1.0.228`
- `serde-wasm-bindgen` `0.6.5`
- `console_error_panic_hook` `0.1.7`
- `thiserror` `2.0.18`
- toolchain: `wasm-pack` `0.14.0`

## Why this set is appropriate for Deepnest

1. `clipper2-rust` is currently the best fit for parity:
   - pure Rust (WASM-friendly, no native C++ toolchain coupling),
   - includes boolean operations + Minkowski, which Deepnest NFP logic needs.
2. `wasm-bindgen` + `serde-wasm-bindgen` is the stable bridge for browser/Electron renderer integration.
3. Error/panic tooling is minimal and production-safe (`thiserror`, `console_error_panic_hook`).

## Alternatives reviewed

- `i_overlay` `4.4.0`:
  - strong boolean engine and active performance positioning,
  - but no direct Minkowski equivalent in the primary API path used by Deepnest NFP flow.
  - Could be evaluated later as an optional boolean backend, while keeping Clipper2 for NFP.

## Recommendation

- Keep current dependency set as default (best parity path).
- If you want to pursue extra speed for boolean-only stages:
  - add experimental feature flag backend (`clipper2` vs `i_overlay`) and benchmark on your real SVG corpus.

## Sources

- Clipper2 docs: https://www.angusj.com/clipper2/Docs/Overview.htm
- clipper2-rust docs: https://docs.rs/clipper2-rust/
- wasm-bindgen docs: https://docs.rs/wasm-bindgen
- serde docs: https://docs.rs/serde
- serde-wasm-bindgen docs: https://docs.rs/serde-wasm-bindgen/0.6.5
- console_error_panic_hook docs: https://docs.rs/console_error_panic_hook/0.1.7
- thiserror docs: https://docs.rs/thiserror
- i_overlay docs: https://docs.rs/i_overlay/4.4.0
- wasm-pack docs: https://drager.github.io/wasm-pack/
