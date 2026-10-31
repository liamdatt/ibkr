#!/bin/sh
# Runs the Client Portal Gateway beside the deployed app. The port is published on loopback only:
# after login the gateway acts on your account for anyone who can reach it, so never publish it wider.
set -eu
network="${1:-openship-ibkr}"
docker build -t ibkr-gateway "$(dirname "$0")"
docker rm -f ibkr-gateway 2>/dev/null || true
docker run -d --name ibkr-gateway --restart unless-stopped --network "$network" -p 127.0.0.1:5000:5000 ibkr-gateway
