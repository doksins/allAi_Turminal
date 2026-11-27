#!/bin/sh
# Install on Alpine Linux, then run start.sh as the intended terminal user.
set -eu
if ! command -v apk >/dev/null 2>&1; then
    echo "This installer requires Alpine Linux (apk)." >&2
    exit 1
fi
if [ "$(id -u)" != 0 ]; then
    echo "Run as root, e.g. doas sh install.sh or sudo sh install.sh." >&2
    exit 1
fi
apk add --no-cache bash ttyd
bash --version | head -n 1
ttyd --version
echo "Installed. Run sh start.sh as your intended terminal user."
