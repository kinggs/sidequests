#!/bin/sh
# What the Linux build needs on top of a bare Ubuntu 16.04: the compiler, jq, a zstd new
# enough for a .vcvplugin, and the Rust that rust-toolchain.toml pins. Run as root.
#
#   ci-linux-setup.sh <a folder holding rust-toolchain.toml>
#
# ci-linux.Dockerfile runs it once to make CI's image, so `apt-get update` (12 of the job's
# 13 minutes on 2026-11-23) is paid when this file changes, not on every push. ci-linux.sh
# runs it itself in a bare ubuntu:16.04, so the build never depends on the image existing.
#
# SPDX-License-Identifier: MIT
set -eu
export DEBIAN_FRONTEND=noninteractive
# Each step says it has started, so a stall shows where it is (2026-11-23: one sat silent in apt).
echo "ci-linux-setup: apt-get update"
apt-get update -q
echo "ci-linux-setup: apt-get install"
apt-get install -yq --no-install-recommends build-essential curl ca-certificates jq >/dev/null
rm -rf /var/lib/apt/lists/*
echo "ci-linux-setup: zstd"
# 16.04's zstd (0.5) is older than the .vcvplugin format; build a pinned release.
curl -fsSL -o /tmp/zstd.tar.gz https://github.com/facebook/zstd/releases/download/v1.5.6/zstd-1.5.6.tar.gz
echo '8c29e06cf42aacc1eafc4077ae2ec6c6fcb96a626157e0593d5e82a34fd403c1  /tmp/zstd.tar.gz' | sha256sum -c -
tar -xzf /tmp/zstd.tar.gz -C /tmp
make -s -C /tmp/zstd-1.5.6/programs -j4 zstd >/dev/null
cp /tmp/zstd-1.5.6/programs/zstd /usr/local/bin/
rm -rf /tmp/zstd.tar.gz /tmp/zstd-1.5.6
# rustup with no default toolchain; then the one rust-toolchain.toml pins, with its targets.
echo "ci-linux-setup: rustup"
curl -fsSL https://sh.rustup.rs | sh -s -- -y -q --profile minimal --default-toolchain none
. "$HOME/.cargo/env"
# There is no default toolchain: rustc resolves only inside a folder that pins it.
(cd "$1" && rustup toolchain install && rustc --version)
# ci-linux.sh looks for this to know the setup has been done.
touch /usr/local/share/pi-ci-linux-setup
