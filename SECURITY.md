# Security Policy

## Supported versions

Only the latest release on the `main` branch is actively maintained. Security fixes
are released as patch versions and published to npm.

| Version | Supported |
|---|---|
| 0.4.x (latest) | ✅ |
| < 0.4 | ❌ |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

If you discover a security issue, please disclose it responsibly by using
[GitHub's private vulnerability reporting](https://github.com/Dunkelheit/pending-promise-recycler/security/advisories/new).

Please include as much of the following as possible:

- A description of the vulnerability and its potential impact.
- Steps to reproduce or a proof-of-concept.
- The affected version(s).
- Any suggested mitigations.

You can expect an acknowledgement within **72 hours** and a resolution timeline
within **14 days** for confirmed vulnerabilities.

## Scope

`pending-promise-recycler` is a zero-dependency utility library. It does not make
network requests, access the file system, or execute arbitrary code. The attack
surface is limited, but denial-of-service scenarios involving the internal promise
registry (e.g. unbounded memory growth) are in scope.
