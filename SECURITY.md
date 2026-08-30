# Security Policy

Ancoda Atlas is maintained by **Ancoda Labs**. Because Atlas is used during
emergencies and lists real donation channels, we treat security reports and
content-integrity reports with the same seriousness.

## Reporting a Vulnerability

If you discover a security issue in Atlas, please report it privately instead of
opening a public GitHub issue.

Email: `research@ancodalabs.com`

Use a subject line like:

`[Atlas Security] short description`

Please include:

- affected component or file
- steps to reproduce
- impact
- proof of concept if available
- any suggested remediation

## Reporting Wrong Hazard Data

If Atlas is showing the wrong picture during an event — gauges, earthquakes,
news, sitrep figures, map pins, a translated brief that does not match the
headlines — open a public GitHub issue with the **Data accuracy** template.
That is the right path for those reports.

Payment details and helplines stay on this email, not on GitHub.

## Reporting a Bad Donation Link or Account Number

This is not a conventional security bug, but it has the same consequences, so it
goes to the same inbox and is triaged ahead of most code issues.

Email `research@ancodalabs.com` with `[Atlas Funds]` in the subject if you find:

- an account number or QR code that does not resolve to the stated payee
- a relief fund listed here that is not legitimate, or is no longer operating
- a helpline number that is wrong, dead, or reassigned
- any donation route on the site that is not the organisation's own page

Include the file under `content/` and the primary source that contradicts it.

## Response Expectations

Best-effort targets:

- acknowledgement within 72 hours
- initial triage within 7 days
- donation and helpline corrections handled same-day where we can verify them
- coordinated disclosure after a fix is available

## Scope

The highest-priority reports are:

- incorrect payment details, donation routes, or emergency numbers
- XSS or HTML/script injection in the dashboard
- unsafe rendering of externally sourced content (news feeds, API responses)
- server-side request forgery through the media proxy or any outbound fetch
- authentication or secret-handling issues
- server-side injection or path traversal
- dependency or supply-chain issues with real exploit impact

## Out of Scope

The following are generally lower priority unless they create a concrete exploit
path:

- minor UI bugs
- missing best-practice headers without impact
- rate limiting or reliability issues without a security consequence
- an upstream data provider being down or returning stale readings

## Public Disclosure

Please do not disclose the issue publicly until a fix is shipped or we agree on a
disclosure timeline.
