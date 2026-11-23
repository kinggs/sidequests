# CI's Linux image: Ubuntu 16.04 with what ci-linux-setup.sh installs, so the Linux job
# pulls it instead of running apt on every push (PLAN.md Session 15, D65 item 4).
# The workflow builds it, with pocket-instruments/ as the context, whenever this file,
# ci-linux-setup.sh or rust-toolchain.toml changes: the image's tag is a hash of the three.
#
# Ubuntu 16.04 is pinned by digest (read from Docker Hub on 2026-11-23): Rack allows glibc
# 2.23 at most (R16) and this image has exactly 2.23, with gcc 5.4. ci-linux.sh refuses to
# build with anything else, and check-dist.sh still holds the finished plugin.
#
# SPDX-License-Identifier: MIT
FROM ubuntu:16.04@sha256:1f1a2d56de1d604801a9671f301190704c25d604a416f59e03c04f5c6ffee0d6
COPY rust-toolchain.toml /opt/pi/rust-toolchain.toml
COPY rack/ci-linux-setup.sh /opt/pi/ci-linux-setup.sh
RUN sh /opt/pi/ci-linux-setup.sh /opt/pi
