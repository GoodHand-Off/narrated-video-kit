#!/bin/sh
# Checks that a secret never reaches Remotion Studio. It starts Studio with a test key in the
# shell, .env.elevenlabs and .env, then writes the key into .env and .env.local (both "=" and
# ":" forms) while Studio runs, since Studio reloads env files live. After each step it
# fetches the Studio page and every script the page loads and fails if the test key is in
# any of them. It also checks that Studio's env file sits in a private per-run directory that
# is gone once Studio stops. Last, it checks that a secret-like REMOTION_* variable, which
# Remotion would publish, stops Studio from starting. CI runs this; run it yourself in a clean checkout (it
# refuses to touch existing env files).
set -eu
cd "$(dirname "$0")/.."
port=${STUDIO_CHECK_PORT:-3217}
canary="sk_canary_$$"
for f in .env .env.local .env.elevenlabs; do
  if [ -e "$f" ]; then
    echo "Error: $f already exists. Run this check in a clean checkout." >&2
    exit 1
  fi
done
log=$(mktemp)
pid=""
trap 'rm -f .env .env.local .env.elevenlabs "$log"; [ -n "$pid" ] && kill "$pid" 2>/dev/null; true' EXIT
printf 'ELEVENLABS_API_KEY=%s\n' "$canary" > .env.elevenlabs
printf 'ELEVENLABS_API_KEY=%s\n' "$canary" > .env
ELEVENLABS_API_KEY="$canary" node node_modules/@remotion/cli/remotion-cli.js studio src/index.ts --port "$port" --no-open > "$log" 2>&1 &
pid=$!

# Fetches the page and every script it loads; fails if the test key is in any of them.
check() {
  page=$(curl -sf --retry 90 --retry-delay 1 --retry-connrefused "http://localhost:$port/")
  scripts=$(printf '%s' "$page" | grep -oE 'src="/[^"]+"' | sed -E 's/^src="\///; s/"$//')
  if [ -z "$scripts" ]; then
    echo "Error: the Studio page loaded no scripts, so there is nothing to check ($1)." >&2
    exit 1
  fi
  found=no
  printf '%s' "$page" | grep -q "$canary" && found=yes
  for s in $scripts; do
    curl -sf "http://localhost:$port/$s" | grep -q "$canary" && found=yes
  done
  if [ "$found" = yes ]; then
    echo "Error: the ElevenLabs key reached Studio ($1)." >&2
    exit 1
  fi
  echo "Studio checked $1: the key is not in the page or its scripts ($scripts)."
}

check "at start"
tmp=$(node -p "require('os').tmpdir()")
envdirs=$(find "$tmp" -maxdepth 1 -name 'narrated-video-kit-env-*' -user "$(id -u)" 2>/dev/null)
if [ -z "$envdirs" ]; then
  echo "Error: Studio is running, but its private env directory was not found in $tmp." >&2
  exit 1
fi
for d in $envdirs; do
  if [ "$(find "$d" -maxdepth 0 -perm 700 | wc -l | tr -d ' ')" != 1 ]; then
    echo "Error: $d is not private (expected mode 700)." >&2
    exit 1
  fi
done
echo "Studio's env file is in a private per-run directory ($(basename "$(echo "$envdirs" | head -1)"))."
printf 'ELEVENLABS_API_KEY: %s\n' "$canary" > .env
printf 'ELEVENLABS_API_KEY=%s\n' "$canary" > .env.local
sleep 3 # Studio polls env files every 100 ms
check "after .env and .env.local were rewritten while it ran"
if grep -q "env file" "$log"; then
  echo "Error: Studio reacted to an env file change: $(grep "env file" "$log" | head -1)" >&2
  exit 1
fi
{ kill "$pid" && wait "$pid"; } 2>/dev/null || true
pid=""
for d in $envdirs; do
  if [ -e "$d" ]; then
    echo "Error: $d is still there after Studio stopped." >&2
    exit 1
  fi
done
echo "Studio stopped with SIGTERM and removed its env directory."

if REMOTION_TEST_API_KEY="$canary" node node_modules/@remotion/cli/remotion-cli.js studio src/index.ts --port "$port" --no-open > "$log" 2>&1; then
  echo "Error: Studio started with a secret-like REMOTION_* variable set." >&2
  exit 1
fi
if ! grep -q "REMOTION_TEST_API_KEY would be copied into the Studio page" "$log"; then
  echo "Error: Studio did not explain why it refused a secret-like REMOTION_* variable." >&2
  exit 1
fi
echo "Studio refused to start with a secret-like REMOTION_* variable set."
