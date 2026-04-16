#!/bin/bash
# PremiereCut Helper Daemon — LaunchAgent kurulum script'i
#
# Bu script daemon'u macOS LaunchAgent olarak kaydeder,
# boylece Mac acildiginda daemon otomatik baslar.

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DAEMON_PATH="$SCRIPT_DIR/server.js"
PLIST_TEMPLATE="$SCRIPT_DIR/com.seyoweb.premierecut.daemon.plist"
PLIST_TARGET="$HOME/Library/LaunchAgents/com.seyoweb.premierecut.daemon.plist"

# Node.js yolunu bul
NODE_PATH=$(which node 2>/dev/null || which /opt/homebrew/bin/node 2>/dev/null || which /usr/local/bin/node 2>/dev/null)
if [ -z "$NODE_PATH" ]; then
  echo "HATA: Node.js bulunamadi. Lutfen Node.js kurun: brew install node"
  exit 1
fi

echo "Node.js: $NODE_PATH"
echo "Daemon: $DAEMON_PATH"
echo ""

# LaunchAgents dizinini olustur
mkdir -p "$HOME/Library/LaunchAgents"

# Template'i doldur
sed -e "s|__DAEMON_PATH__|$DAEMON_PATH|g" \
    -e "s|__HOME__|$HOME|g" \
    -e "s|__WORKDIR__|$SCRIPT_DIR|g" \
    -e "s|/usr/local/bin/node|$NODE_PATH|g" \
    "$PLIST_TEMPLATE" > "$PLIST_TARGET"

echo "plist olusturuldu: $PLIST_TARGET"

# Onceden yukluyse kaldir
launchctl unload "$PLIST_TARGET" 2>/dev/null || true

# Yukle
launchctl load "$PLIST_TARGET"

# Dogrula
sleep 2
if curl -sf http://127.0.0.1:53117/ping > /dev/null; then
  echo ""
  echo "✅ PremiereCut Daemon calisiyor"
  echo "   http://127.0.0.1:53117"
  echo "   Log: $HOME/Library/Logs/premierecut-daemon.log"
else
  echo ""
  echo "⚠️  Daemon baslatildi ama ping cevap vermiyor. Log'u kontrol edin:"
  echo "   cat $HOME/Library/Logs/premierecut-daemon.error.log"
fi
