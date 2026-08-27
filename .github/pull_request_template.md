## Summary

Describe what changed.

## Why

Explain the problem being solved.

## Scope

- [ ] Focused bug fix
- [ ] Small UX improvement
- [ ] New source
- [ ] Dashboard change
- [ ] Docs/config change

## Validation

List the commands, checks, or manual validation you performed.

## Screenshots

If the dashboard or any visible output changed, add screenshots.

## Config and Docs

- [ ] No new environment variables
- [ ] `.env.example` updated if needed
- [ ] `README.md` updated if behavior changed

## Source Additions

If this PR adds a new source, explain:

- which natural hazard it covers (Atlas is hazard-only — see CONTRIBUTING.md)
- why the source improves hazard signal quality
- whether it requires an API key
- how it degrades when the key is missing
- what changed in `apis/briefing.mjs` and `lib/synthesize.mjs`

## Content Changes

If this PR touches anything under `content/` — relief funds, bank details,
helplines, or figures — state the primary source for every value you changed.
These reach people who are giving money or calling for help during a disaster.

## Checklist

- [ ] This PR stays within one bugfix or one feature family
- [ ] I kept unrelated changes out of the diff
- [ ] I considered security for any externally sourced content being rendered
- [ ] I tested the changed path locally
- [ ] Any content change cites a primary source
- [ ] I agree my contribution is licensed under the AGPL-3.0 (see CONTRIBUTING.md)
