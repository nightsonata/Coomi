# CoomiDev APK Workflow

This workflow builds an isolated **CoomiDev** APK from any branch in your fork.
It is intentionally separate from the Runtime V2 assets workflow so that
build/dependency/architecture failures cannot impact the runtime distribution.

## What it produces

- A signed debug APK with:
  - **package**: `com.coomidev.android`
  - **label**: `CoomiDev`
  - **port**: `18765`
  - **icon**: `assets/coomi-agent-dev.png`
  - **ABI**: `arm64-v8a`
- SHA-256 checksum file alongside the APK.
- An uploadable artifact named `coomidev-apk` (retained 14 days).

## Toolchain pins

| Tool | Version | Reason |
|------|---------|--------|
| Ubuntu runner | `ubuntu-24.04` | Matches existing Runtime V2 workflows |
| JDK | Temurin 17 | AGP 8.13.2 requirement |
| Node | 20 | Matches `apps/web` dev tooling |
| Rust | 1.95.0 | Pinned by `apps/coomi-rs/rust-toolchain.toml` |
| Rust target | `aarch64-linux-android` | For Android-bound native code |
| Android compile SDK | 36 | Pinned in `gradle.properties` |
| Android NDK | 27.0.12077973 | Pinned in `gradle.properties` |
| Android build-tools | 36.0.0 | Matches compile SDK |
| Gradle wrapper | 9.2.1 | From `gradle/wrapper/gradle-wrapper.properties` |

## How to trigger

From the phone (ProotLinux guest) with `gh` authenticated:

```sh
gh workflow list                                  # confirm 'CoomiDev APK (build)' is listed
gh workflow run coomidev-apk.yml \
   --ref codex/coomidev-ci                        # or any other feature branch
gh run list --workflow coomidev-apk.yml --limit 5
gh run watch <run-id> --exit-status                # block until done
gh run view <run-id> --log-failed                 # on failure: see only failed steps
gh run download <run-id> --name coomidev-apk --dir ~/CoomiDev-output
```

> The default `ref` is the calling branch, never `main`, to prevent an
> accidental build of the official main branch from being mistaken for
> your custom iteration.

## Security notes

- The workflow uses the **debug keystore** generated in this job; the
  resulting APK is signed with `androiddebugkey` and is suitable for
  side-loading only. Never publish a debug-signed APK as a release.
- The workflow file does **not** include any private keys, signing
  passwords, or environment secrets. A release job that needs a real
  signing key must read it from a GitHub encrypted secret that the
  user provisions explicitly.
- `permissions: contents: read` is the minimum required for build-only
  operations. The workflow cannot push to the repository or publish
  releases.

## When not to use this workflow

- When the user explicitly asks for a local ARM64 build (use
  `tools/mobile-build/build-coomidev.sh` instead).
- When the change is documentation-only and does not need an APK
  (no need to consume runner minutes).
- When the official `main` branch needs to be touched: this workflow
  cannot push to `TensorHub-ORG/Coomi`.
