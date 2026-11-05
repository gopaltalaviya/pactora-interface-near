# Security

This is the Pactora website. It holds no keys and no funds: the API key a
visitor pastes into `/demo` stays in that tab, and wallet actions are signed
in the visitor's own wallet. The contracts' threat model is in
`pactora-contracts-near/SECURITY.md`; the site's is at `/docs/security`.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting
on this repository ("Security" tab → "Report a vulnerability") with the page,
what you found, and a reproduction if you have one. Credit is given in the fix
commit.
