# Documentation Standards

This document outlines the documentation conventions for the Actly Editor codebase.

## Why Documentation Matters

Good documentation helps developers understand the codebase faster, reduces onboarding time, and makes it easier to maintain and extend the application. All public APIs, services, and significant components should be documented.

## Docstring Requirements

### TypeScript / JavaScript

All exported functions, classes, interfaces, and significant modules should have JSDoc comments:

```ts
/**
 * Brief description of what the function does.
 * @param paramName - Description of the parameter
 * @returns Description of what is returned
 * @throws Description of exceptions that may be thrown
 */
export async function myFunction(paramName: string): Promise<Result> {
  // ...
}
```

**Where to add docstrings:**

- All functions in `src/services/` — these are the core business logic
- All functions in `src/store/` — state management
- All components in `src/panels/` and `src/components/` — at minimum the component itself
- All Tauri command wrappers in `src/services/tauri.ts`
- All registry files in `src/registries/`

**What to document:**

- Purpose of the function/component
- Parameters and their types
- Return value
- Side effects
- Error cases
- Example usage (for complex functions)

### Rust

All public functions and structs should have doc comments:

```rust
/// Brief description of what this function does.
///
/// More detailed description if needed.
///
/// # Arguments
///
/// * `param_name` - Description of the parameter
///
/// # Returns
///
/// Description of return value
#[tauri::command]
pub fn my_function(param_name: String) -> Result<String, Error> {
    // ...
}
```

**Where to add docstrings:**

- All commands in `src-tauri/src/commands/`
- All structs and enums in Rust files

## Generating Documentation

The project does not currently have automated API documentation generation. To add this capability:

1. Install a documentation generator like `typedoc` for TypeScript
2. Configure it in `package.json` or a dedicated `typedoc.json`
3. Add a script to generate docs: `npm run docs:generate`
4. Consider adding a GitHub action to deploy docs to a static site

Example `typedoc.json` configuration:
```json
{
  "entryPoints": ["src"],
  "out": "docs/api",
  "tsconfig": "tsconfig.json",
  "excludePrivate": true
}
```

## Current State

As of this writing, the codebase has inconsistent documentation coverage:

- Some services have basic docstrings (`src/services/db.ts`, `src/services/codex.ts`)
- Most components and stores lack documentation
- Rust commands are mostly undocumented

The goal is to bring all public APIs to a documented state.

## Contribution Guidelines

When adding new code:

1. Add appropriate docstrings before submitting
2. Update this document if documentation conventions change
3. Keep API documentation in sync with code changes
