#!/bin/bash
# PremiereCut daemon'u kaldirir

PLIST_TARGET="$HOME/Library/LaunchAgents/com.seyoweb.premierecut.daemon.plist"

if [ -f "$PLIST_TARGET" ]; then
  launchctl unload "$PLIST_TARGET" 2>/dev/null || true
  rm -f "$PLIST_TARGET"
  echo "PremiereCut daemon kaldirildi."
else
  echo "Daemon kurulu degil."
fi
