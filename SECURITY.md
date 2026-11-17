# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub's private vulnerability reporting: open this repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue.

Include the version or commit, what you found and how to reproduce it. Never include a real API key.

We aim to acknowledge reports within five business days.

## Supported versions

Only the latest release receives fixes.

## The ElevenLabs key

- `scripts/narrate.ts` reads `ELEVENLABS_API_KEY` from the shell or from `.env.elevenlabs`, which is gitignored, and from nowhere else. Remotion never reads `.env.elevenlabs`.
- By default Remotion copies every variable from `.env` (or `.env.local` when there is no `.env`) into the Studio page and every render, and reloads that file while Studio runs; Studio is reachable from other devices on the network. `remotion.config.ts` runs at the start of every Remotion command and points Remotion at an empty env file created for that run in a new private directory (mode 0700, file mode 0600, created exclusively so no existing path or link is followed), removed when the command exits. `.env`, `.env.local` and other users on the machine therefore cannot put variables on the page; a program running as your own user could still write to that file while Studio runs.
- **Every variable named `REMOTION_*` is public.** Remotion passes those to the page from your shell and from `.env`, which its CLI loads at start. `remotion.config.ts` refuses to start when one looks like a secret (KEY, TOKEN, SECRET, PASSWORD, CREDENTIAL, AUTH or PRIVATE in the name). Do not put secrets in any other `REMOTION_*` variable.
- Remotion commands refuse to start without `remotion.config.ts`.
- CI runs `scripts/studio-check.sh`: it starts Studio with a test key in the shell, `.env.elevenlabs` and `.env`, writes it into `.env` and `.env.local` while Studio runs, and fails if the key appears in the Studio page or any script it loads. It also checks that a secret-like `REMOTION_*` variable stops Studio from starting.
- The key goes only in the `xi-api-key` header to `https://api.elevenlabs.io`, with a timeout on every request. It is never logged or written to a file, and it is cut out of any error text the provider sends back.
- Captions-only mode (`--captions-only`) makes no network calls and needs no key.
- If a key is ever committed or exposed, revoke it in your ElevenLabs account first, then remove it from history.
