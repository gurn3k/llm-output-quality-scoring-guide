#!/bin/sh
# Chrome for filming: no background traffic of its own, and no route off this machine
# (every non-loopback connection is sent to a closed local port).
exec /usr/bin/google-chrome --disable-background-networking --disable-component-update --disable-sync --disable-default-apps --disable-domain-reliability --no-pings --disable-features=OptimizationHints,MediaRouter,Translate --proxy-server=http://127.0.0.1:9 "$@"
