# Security Policy

## Reporting

Do not open a public issue containing API keys, credentials, private endpoints, or session data. Use the repository owner's private security contact or GitHub Security Advisories.

## Credential handling

- Rotate a credential immediately if it appears in source control, an npm package, logs, or a session transcript.
- Removing a credential from the latest commit is not sufficient; revoke it first, then clean Git history and published artifacts.
- Run `npm run secrets`, `ccc doctor`, and `npm run pack:check` before publishing.
- CCC stores credentials locally. POSIX profile and backup files are restricted to mode `0600`; directories use `0700`.

## Supported version

Security fixes are provided for the latest npm release.
