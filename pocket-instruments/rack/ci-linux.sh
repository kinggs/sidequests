#!/bin/sh
# P5, Linux: the plugin built inside Ubuntu 16.04, run by CI as root in a throwaway container.
# Rack allows glibc 2.23 at most (R16), and 16.04 has exactly 2.23, with gcc 5.4. Phona
# builds the same way (R16a). VCV's own toolchain gets there with a 2.23 sysroot, but has no
# Rust and must be built as an image first.
#
#   ci-linux.sh <Rack SDK folder>     (from anywhere; it finds the repo from itself)
#
# The container is CI's own image (ci-linux.Dockerfile), which has the tools already. In a
# bare ubuntu:16.04 this installs them first, as it did on every push until Session 15.
#
# SPDX-License-Identifier: MIT
set -eu
here=$(cd "$(dirname "$0")" && pwd)
export RACK_DIR=$1
if [ -e /usr/local/share/pi-ci-linux-setup ]; then
    echo "ci-linux: the image has the tools"
else
    sh "$here/ci-linux-setup.sh" "$here/.."
fi
. "$HOME/.cargo/env"
# There is no default toolchain: rustc resolves only inside the folder that pins it.
cd "$here/.."
# A no-op when the image already holds the pinned Rust; the download if the pin has moved.
rustup toolchain install
gcc=$(gcc --version | sed -n 1p)
libc=$(ldd --version | sed -n 1p)
echo "$gcc"
echo "$libc"
rustc --version
# Exactly these, whatever image this ran in: a newer glibc builds a plugin Rack cannot load.
case $gcc in *" 5.4."*) ;; *) echo "ci-linux: gcc is not 5.4"; exit 1 ;; esac
case $libc in *" 2.23") ;; *) echo "ci-linux: glibc is not 2.23"; exit 1 ;; esac
make -C "$here" -j4 dist
