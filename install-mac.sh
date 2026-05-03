#!/bin/bash
# PremierSEYO macOS — tek komut kurulum
#
# Kullanim (terminale yapistir):
#   curl -fsSL https://raw.githubusercontent.com/seyoagency/premier-seyo/master/install-mac.sh | bash
#
# Bu script:
#   1. Xcode Command Line Tools (yoksa kurar)
#   2. Homebrew (yoksa kurar)
#   3. ffmpeg + node (yoksa brew ile kurar)
#   4. PremierSEYO repo'yu indirip ~/.local/share/premier-seyo/'a koyar
#   5. daemon/install-daemon.sh ile LaunchAgent + plugin install eder
#   6. Native notification: "Premiere'i kapat-ac"

set -euo pipefail

VERSION="1.2.3"
REPO="seyoagency/premier-seyo"

c_blue() { printf "\033[1;34m%s\033[0m\n" "$1"; }
c_green() { printf "\033[1;32m%s\033[0m\n" "$1"; }
c_yellow() { printf "\033[1;33m%s\033[0m\n" "$1"; }
c_red() { printf "\033[1;31m%s\033[0m\n" "$1"; }

c_blue "
======================================================
  PremierSEYO v${VERSION} — macOS Kurulumu
  Auto-Cut + Auto-SRT for Premiere Pro
======================================================
"

# 1. macOS kontrol
if [ "$(uname -s)" != "Darwin" ]; then
  c_red "Bu script yalnizca macOS icindir. Windows icin:"
  c_red "  https://github.com/${REPO}/releases/latest"
  exit 1
fi

ARCH=$(uname -m)
OSVER=$(sw_vers -productVersion 2>/dev/null || echo "?")
c_blue "==> macOS ${OSVER} (${ARCH}) tespit edildi"

# 2. Xcode Command Line Tools (brew + homebrew/installer formula icin gerekli)
if ! xcode-select -p >/dev/null 2>&1; then
  c_yellow "==> Xcode Command Line Tools kuruluyor..."
  c_yellow "    Bir GUI dialog acilacak — 'Install' tikla, kurulum bitince bu script otomatik devam edecek"
  xcode-select --install 2>/dev/null || true
  echo -n "    Bekleniyor"
  while ! xcode-select -p >/dev/null 2>&1; do
    echo -n "."
    sleep 5
  done
  echo ""
fi
c_green "Xcode CLT: $(xcode-select -p)"

# 3. Homebrew
if ! command -v brew >/dev/null 2>&1; then
  c_yellow "==> Homebrew yok, kuruluyor..."
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# Apple Silicon icin brew PATH'e ekle
if [ "$ARCH" = "arm64" ] && [ -x /opt/homebrew/bin/brew ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [ -x /usr/local/bin/brew ]; then
  eval "$(/usr/local/bin/brew shellenv)"
fi
c_green "Homebrew: $(command -v brew)"

# 4. Bagimliliklar
c_blue "==> Bagimliliklar kontrol/kuruluyor (ffmpeg + node)..."
NEEDED=()
command -v ffmpeg >/dev/null || NEEDED+=("ffmpeg")
command -v node >/dev/null || NEEDED+=("node")
if [ ${#NEEDED[@]} -gt 0 ]; then
  c_yellow "    Eksik: ${NEEDED[*]} — kuruluyor (~3-5 dk)"
  brew install --quiet "${NEEDED[@]}" >/dev/null 2>&1 || brew install "${NEEDED[@]}"
fi
c_green "FFmpeg: $(command -v ffmpeg)"
c_green "Node: $(command -v node) — $(node --version)"

# 5. Repo indir (tarball, git clone gerekmez)
INSTALL_DIR="$HOME/.local/share/premier-seyo"
mkdir -p "$INSTALL_DIR"
c_blue "==> PremierSEYO v${VERSION} indiriliyor → ${INSTALL_DIR}"
TMP_TAR=$(mktemp -t premier-seyo-XXXXXX.tar.gz)
curl -fsSL "https://github.com/${REPO}/archive/refs/tags/v${VERSION}.tar.gz" -o "$TMP_TAR"
# Eski icerigi temizle
find "$INSTALL_DIR" -mindepth 1 -delete 2>/dev/null || true
tar xzf "$TMP_TAR" -C "$INSTALL_DIR" --strip-components=1
rm -f "$TMP_TAR"
c_green "Repo cikartildi: ${INSTALL_DIR}"

# 6. Daemon + plugin install (LaunchAgent + UXP plugin install dizini)
c_blue "==> Daemon ve UXP plugin kuruluyor..."
chmod +x "${INSTALL_DIR}/daemon/install-daemon.sh"
# install-daemon.sh interaktif key prompt'unu pipe ortaminda atlar (read tek seferlik)
"${INSTALL_DIR}/daemon/install-daemon.sh" </dev/null

# 7. Premiere acik mi uyari
echo ""
if pgrep -f "Adobe Premiere Pro" > /dev/null 2>&1; then
  c_yellow "  UYARI: Premiere Pro su anda acik. Yeni eklentinin yuklenmesi icin"
  c_yellow "         Cmd+Q ile tam kapat -> tekrar ac."
  echo ""
fi

# 8. Final mesaj + native notification
c_green "======================================================"
c_green "  ✓ PremierSEYO v${VERSION} kuruldu"
c_green "======================================================"
echo ""
echo "  Sonraki adimlar:"
echo "    1. Premiere Pro'yu Cmd+Q ile kapat -> tekrar ac"
echo "    2. Window > UXP Plugins > PremierSEYO > PremierSEYO"
echo "    3. Sag ust ⚙ -> Deepgram API key yapistir -> 'Kaydet ve Baglan'"
echo ""
echo "  Yardim: https://github.com/${REPO}#sorun-giderme"
echo "  Sorun bildirimi: https://github.com/${REPO}/issues"
echo ""

osascript -e 'display notification "PremierSEYO kuruldu! Premiere Pro Cmd+Q ile kapat-aç, sonra Window > UXP Plugins > PremierSEYO." with title "PremierSEYO ✓" sound name "default"' 2>/dev/null || true

exit 0
