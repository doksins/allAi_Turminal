#!/bin/sh
# ALLAI web terminal for Alpine Linux.
# Install (as root): apk add --no-cache bash ttyd
# Start as the intended shell user: sh start.sh
# Access localhost:7681 via SSH port forwarding or a trusted HTTPS proxy.
set -eu

for cmd in bash ttyd; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "Missing $cmd. Install with: apk add --no-cache bash ttyd" >&2
        exit 1
    fi
done

port=${PORT:-7681}
bind=${TERMINAL_BIND:-127.0.0.1}
credential=${TERMINAL_CREDENTIAL:-}

# Remote binding requires authentication and a trusted HTTPS proxy.
if [ "$bind" != "127.0.0.1" ] && [ -z "$credential" ]; then
    echo "Non-local binding requires TERMINAL_CREDENTIAL=user:password." >&2
    exit 1
fi

set -- -i "$bind" -p "$port" -W -O -m 1 -t fontSize=15
if [ -n "${TERMINAL_BASE_PATH:-}" ]; then
    set -- "$@" -b "$TERMINAL_BASE_PATH"
fi
if [ -n "${TERMINAL_TLS_CERT:-}${TERMINAL_TLS_KEY:-}" ]; then
    if [ ! -r "${TERMINAL_TLS_CERT:-}" ] || [ ! -r "${TERMINAL_TLS_KEY:-}" ]; then
        echo "Both readable TERMINAL_TLS_CERT and TERMINAL_TLS_KEY are required." >&2
        exit 1
    fi
    set -- "$@" -S -C "$TERMINAL_TLS_CERT" -K "$TERMINAL_TLS_KEY"
fi
if [ -n "$credential" ]; then
    case "$credential" in
        ?*:?*) ;;
        *) echo "TERMINAL_CREDENTIAL must be user:password." >&2; exit 1 ;;
    esac
    set -- "$@" -c "$credential"
fi
unset TERMINAL_CREDENTIAL credential

echo "Web terminal listening on $bind:$port (Ctrl+C to stop)."
if [ "$(id -u)" = 0 ]; then
    echo "Warning: the web terminal will have root privileges." >&2
fi
exec ttyd "$@" /bin/bash -i
