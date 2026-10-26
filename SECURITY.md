# Security policy

## Supported versions

Security fixes go into the **latest release** of `glassparency` on npm. Please update to it before reporting.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it privately through GitHub: go to this repository's **Security** tab → **Report a vulnerability**
([direct link](https://github.com/RicoSuaveDev/glassparency/security/advisories/new)). Only the maintainers can see
the report.

Please include:

- what the problem is and what an attacker could do with it,
- the affected version(s),
- steps or a small page that reproduces it.

You'll get a reply as soon as possible. Once a fix is released, the advisory is published with credit to you
(unless you'd rather stay anonymous).

## Scope

Glassparency only changes how a page *looks*: it reads the page (to draw the glass) and never sends data anywhere.
Relevant reports include, for example: script injection through config values or attributes
(`data-glassparency-props`, `<glass-ui props>`), the injected `<style>` / SVG filters bypassing a page's
Content-Security-Policy, or anything in the published package that runs code it shouldn't.
