# Security policy

## Reporting a vulnerability

Please **don't open a public issue** for a security problem. Use GitHub's private
reporting instead:

1. Go to the repository's **Security** tab.
2. Choose **Report a vulnerability** (or use
   <https://github.com/dndd7/free-world-2d/security/advisories/new>).

Include what you found, the steps to reproduce it, the browser you used, and what you
think the impact is.

This is a hobby project maintained by one person, so reports are looked at on a
best-effort basis. There is no guaranteed response time, but a clear report with steps to
reproduce will always help.

## What this app is

Free World 2D is a static, fully client-side web page. It has no server, no accounts and
makes no network requests of its own. Everything you build is kept in your browser
(`localStorage`) and only leaves it if you use Export.

That shapes what is worth reporting. Things that **are** in scope:

- A crafted scene file (loaded with **Import**, or placed in `examples/`) that runs script,
  or reads or writes data it should not be able to.
- Anything that lets one page or site tamper with another person's saved scene.
- Problems in the build, the dependencies or the GitHub Actions workflows (for example a
  way to run untrusted code in CI, or a leaked secret).

Things that are **not** security issues, and are better reported as normal issues:

- Physics glitches, objects passing through each other, or odd behaviour in a design.
- A very large or complicated scene making the page slow.
- Vulnerabilities in other sites or in your browser itself.

## Supported versions

Only the latest version on `master`, which is what the live site serves, is supported.
There are no older releases to patch.

## Safeguards already in place

- Imported scene files are validated before use, and nothing is rendered with `innerHTML`.
- Dependabot opens weekly pull requests for npm packages and GitHub Actions.
- A security workflow runs CodeQL and `npm audit` on every push, on pull requests and
  weekly.
- GitHub secret scanning and push protection are enabled.
- Every GitHub Action is pinned to an exact commit.
