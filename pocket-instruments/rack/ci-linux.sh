#!/bin/sh
# P5, Linux: the plugin built inside Ubuntu 16.04, run by CI as root in a throwaway container.
# Rack allows glibc 2.23 at most (R16), and 16.04 has exactly 2.23, with gcc 5.4. Phona
# builds the same way (R16a). VCV's own toolchain gets there with a 2.23 sysroot, but has no
# Rust and must be built as an image first.
#
#   ci-linux.sh <Rack SDK folder>     (from anywhere; it finds the repo from itself)
#
# SPDX-License-Identifier: MIT
set -eu
here=$(cd "$(dirname "$0")" && pwd)
export RACK_DIR=$1
export DEBIAN_FRONTEND=noninteractive
apt-get update -q >/dev/null
apt-get install -yq --no-install-recommends build-essential curl ca-certificates jq >/dev/null
# 16.04's zstd (0.5) is older than the .vcvplugin format; build a pinned release.
curl -fsSL -o /tmp/zstd.tar.gz https://github.com/facebook/zstd/releases/download/v1.5.6/zstd-1.5.6.tar.gz
echo '8c29e06cf42aacc1eafc4077ae2ec6c6fcb96a626157e0593d5e82a34fd403c1  /tmp/zstd.tar.gz' | sha256sum -c -
tar -xzf /tmp/zstd.tar.gz -C /tmp
make -s -C /tmp/zstd-1.5.6/programs -j4 zstd >/dev/null
cp /tmp/zstd-1.5.6/programs/zstd /usr/local/bin/
# rustup with no toolchain; then the one rust-toolchain.toml pins, with its targets.
curl -fsSL https://sh.rustup.rs | sh -s -- -y -q --profile minimal --default-toolchain none
. "$HOME/.cargo/env"
# There is no default toolchain: rustc resolves only inside the folder that pins it.
cd "$here/.."
rustup toolchain install
gcc --version | sed -n 1p
ldd --version | sed -n 1p
rustc --version
make -C "$here" -j4 dist
