# Repository Guidelines

## Project Structure & Module Organization

This repository is an initial workspace. At the time this guide was created, it contained no application source, tests, assets, package manifests, or Git metadata. No language or framework has been selected.

When adding the first implementation, group application code, tests, and static assets in clearly named directories such as `src/`, `tests/`, and `assets/`, where appropriate for the chosen framework. Add a `README.md` describing the resulting layout and setup process.

## Build, Test, and Development Commands

No build, test, or development commands are currently configured. Once tooling is introduced, document the exact installation, local startup, build, lint, and test commands in `README.md`. Include required runtime versions and configuration prerequisites. Keep those commands aligned with committed scripts and CI configuration.

For initial inspection, use `ls -la` to include hidden entries and `rg --files --hidden` to list files.

## Coding Style & Naming Conventions

Choose the language's standard formatter and linter when introducing source code, and commit their configuration. Use spaces for indentation, with the width specified by that configuration. Keep names descriptive and follow the selected language's conventions. Use Markdown headings and fenced code blocks in documentation.

## Testing Guidelines

No test framework or coverage threshold is established. Introduce an appropriate runner with the first testable feature. Group tests by module and follow the runner's standard file naming pattern. Cover expected behavior, error paths, and regression cases. Record the test command and required fixtures in `README.md`.

## Commit & Pull Request Guidelines

No Git history is available to establish existing conventions. As an initial recommendation, use short, imperative commit subjects, such as `Add project setup documentation`.

Pull requests should explain the change, its purpose, and how it was verified. Link relevant issues, include screenshots for visible interface changes, and identify any setup or migration steps.
