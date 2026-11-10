# Server error monitoring

The CommonJS server reports unexpected errors from Express, AS operations and
Supabase authentication handlers, plus uncaught exceptions/rejections. Expected
4xx errors are excluded. Browser errors are not connected yet.

## Local use

Use Node 22.12+ LTS or Node 24/26; verification used Node 26.13.0.
Create the git-ignored `.env.sentry.local` with `SENTRY_DSN` and
`SENTRY_ENVIRONMENT=development`. This file is not distributed through Git.

Run `npm run start:sentry` to start with this file. Plain `npm start` reports only
when `SENTRY_DSN` is already supplied by the environment. Existing running server
processes must be restarted to pick up these changes.

Run `npm run sentry:verify` to send one synthetic error without starting the app
or reading business data. The command requires HTTP 200 from Sentry, then prints
the event ID to look up in Issues. No public test-error endpoint is installed.
Run `npm run test:sentry` for local tests that do not send real events.

## Data and scope

Outgoing events use an allowlist: technical error type, project-relative code
file/line/column, event ID/time and configured environment/release. Error messages,
request content, headers, cookies, users, breadcrumbs, context and extra fields
are removed. This deliberately limits diagnostic detail to avoid business data.
The receiving service necessarily sees the connection's source IP at network level.

Logs, tracing, profiling and Replay are not enabled. No notifications or availability
monitoring were configured here. A stopped/offline server cannot report errors.

For a separately approved production deployment, supply the DSN via the hosting
environment, set `SENTRY_ENVIRONMENT=production` and `SENTRY_RELEASE` to the exact
release/commit. Do not copy customer data or credentials into Sentry configuration.
Remove `SENTRY_DSN` and restart to disable reporting. Production deployment and
browser SDK installation are separate steps.
