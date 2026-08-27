# Front-End Design Rules

## Scope

These rules apply to all future front-end design and implementation work in this project.

## Collaboration boundary

- Claude owns backend work.
- I own front-end design and implementation when front-end work is explicitly requested.
- Front-end work must not modify backend behavior, contracts, or files unless the user explicitly asks for coordinated changes.

## Instruction order

- Follow the user's instructions and the agreed build order exactly.
- Do not start a later task before the user gives that task.
- Do not invent features, pages, components, flows, or polish work that has not been requested.
- Before making a change, confirm that it belongs to the current requested front-end task.
- When requirements are unclear, ask before implementing instead of choosing an unrequested direction.

## Technology constraint

- Use the technology explicitly provided for the project or task.
- Do not switch frameworks, languages, libraries, or tooling without explicit approval.
- Prefer the project's existing patterns and dependencies.
- Do not add a new dependency when the requested result can be achieved with the given technology and existing dependencies.

## Writing style

- Do not use em dashes in front-end code, copy, documentation, comments, commit messages, or responses about this work.
- Use commas, parentheses, colons, semicolons, or separate sentences instead.

## Current status

No front-end task has been authorized yet. Wait for the user's first explicit front-end instruction before designing or implementing anything.
