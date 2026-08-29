# Issue tracker: GitHub

Issues and specifications for this repository live in GitHub Issues at `ve250104/OpenBPMN`. Use the `gh` CLI for all operations.

## Conventions

- Create an issue with `gh issue create`.
- Read an issue and its discussion with `gh issue view <number> --comments`.
- List and filter issues with `gh issue list`.
- Comment with `gh issue comment <number>`.
- Apply or remove labels with `gh issue edit`.
- Close an issue with `gh issue close`.
- Infer the repository from the configured Git remote.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub shares one number space across issues and pull requests. If a reference is ambiguous, try `gh pr view <number>` and then `gh issue view <number>`.

## Skill operations

When a skill says “publish to the issue tracker,” create a GitHub issue.

When a skill says “fetch the relevant ticket,” read the issue and its comments.

## Wayfinding operations

The Wayfinder map is one issue labelled `wayfinder:map`. Its decision tickets are GitHub sub-issues labelled with one of:

- `wayfinder:research`
- `wayfinder:prototype`
- `wayfinder:grilling`
- `wayfinder:task`

Use GitHub’s native issue dependencies for blocking relationships when available. If dependencies are unavailable, add `Blocked by: #<number>` to the ticket body.

The frontier consists of the map’s open, unassigned sub-issues that have no open blockers. Claim a frontier ticket before working by assigning it to the current developer.

Resolve a ticket by:

1. Posting its answer as a resolution comment.
2. Closing the ticket.
3. Appending a short linked context pointer to the map’s “Decisions so far.”
