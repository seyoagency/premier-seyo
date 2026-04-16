# PremiereCut

Adobe Premiere Pro 2026 icin otomatik sessizlik kesimi ve altyazi uretim eklentisi.

## Ozellikler

**AUTO-CUT**
- FFmpeg `silencedetect` ile sessiz bolgeleri otomatik tespit eder
- Nefes sesleri ve kisa sessizlikleri opsiyonel olarak keser
- Orijinal sequence'e dokunmadan duplicate uzerinde calisir (gevenli)
- Padding, esik degeri, minimum sure gibi profesyonel parametreler

**AUTO-SRT**
- whisper.cpp + large-v3 modeli ile offline Turkce transkripsiyon
- Word-level timestamp'lerle profesyonel SRT ciktisi
- Satir/kelime/karakter limitleri tamamen ayarlanabilir
- SRT, VTT formatlari; opsiyonel Premiere caption track entegrasyonu

## Mimari

```
Premiere Pro UXP Plugin (panel)
      |
      | HTTP (127.0.0.1:53117)
      v
PremiereCut Helper Daemon (Node.js)
      |
      +-- FFmpeg (silence detection, audio export)
      +-- whisper-cli (speech-to-text)
      +-- File system operations
```

UXP'nin shell kisitlamalari nedeniyle FFmpeg ve whisper'i dogrudan
cagiramayiz. Bu yuzden arka planda hafif bir Node.js daemon calisir.
Daemon macOS LaunchAgent olarak kaydedilir — Mac her acildiginda
otomatik baslar.

## Kurulum

### 1. Bagimliliklar

```bash
# FFmpeg (audio analiz)
brew install ffmpeg

# Whisper (speech-to-text)
brew install whisper-cpp

# Node.js (daemon icin)
brew install node

# Whisper large-v3 modeli (~3 GB)
mkdir -p ~/.local/share/whisper
curl -L \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin \
  -o ~/.local/share/whisper/ggml-large-v3.bin
```

### 2. Helper Daemon

```bash
cd /Users/seyo/Projects/premiere-cut/daemon
./install-daemon.sh
```

Daemon LaunchAgent olarak kurulur ve her restart'ta otomatik baslar.

Kontrol:
```bash
curl http://127.0.0.1:53117/check
# Beklenen: {"ok":true,"ffmpeg":true,"whisper":true,"models":["ggml-large-v3.bin"]}
```

Kaldirma:
```bash
cd daemon && ./uninstall-daemon.sh
```

### 3. Plugin

```bash
cd /Users/seyo/Projects/premiere-cut

# .ccx olarak paketle
STAGE=/tmp/premierecut-stage
rm -rf "$STAGE"
mkdir -p "$STAGE"
cp manifest.json "$STAGE/"
cp -R src "$STAGE/"
cp -R icons "$STAGE/"
cd "$STAGE"
zip -r /tmp/premierecut.ccx . -x "*.DS_Store"

# Premiere'a yukle (UPIA)
UPIA="/Library/Application Support/Adobe/Adobe Desktop Common/RemoteComponents/UPI/UnifiedPluginInstallerAgent/UnifiedPluginInstallerAgent.app/Contents/MacOS/UnifiedPluginInstallerAgent"
"$UPIA" --install /tmp/premierecut.ccx
```

**ONEMLI**: Plugin kurulduktan sonra Premiere Pro'yu tamamen kapatip
yeniden acin. UXP plugin'leri cache'ler — yeni versiyon ancak restart
sonrasi yuklenir.

### 4. Premiere'da Panel'i Ac

Premiere Pro menusu:
```
Window > UXP Plugins > PremiereCut > PremiereCut
```

## Kullanim

### AUTO-CUT

1. Sequence'i ac, kesmek istedigin klibi timeline'a ekle
2. Plugin panelinde **Sessizlik Esigi** (default -35 dB) ve **Min. Sessizlik** (0.4s) ayarla
3. **Analiz Et** — Plugin sessiz/nefes bolgelerini tespit eder
4. Sonuclari incele (waveform onizleme, istatistikler)
5. **Uygula** — orijinal sequence korunur, "Adiniz - AutoCut" isimli yeni sequence olusturulur

### AUTO-SRT

1. **AUTO-SRT** sekmesine gec
2. Dil sec (Turkce, English, Otomatik)
3. Model sec (large-v3 en kaliteli ama yavas, base en hizli)
4. Altyazi bicimini ayarla:
   - Satir/altyazi (1-3)
   - Kelime/satir (2-12)
   - Karakter/satir (20-60)
5. Cikti formatini sec (SRT, VTT)
6. **Transkript Et** — Whisper calisir (1-5 dakika video icin)
7. Onizleme incele, **Kaydet** — `~/Documents/PremiereCut/` altina yazilir

## Ayarlar

Plugin tum ayarlari localStorage'da saklar. Varsayilanlar:

| Ayar | Varsayilan | Aralik |
|------|-----------|--------|
| Sessizlik esigi | -35 dB | -50 ile -20 |
| Min. sessizlik | 0.4s | 0.2-2.0s |
| Padding | 150ms | 0-500ms |
| Satir / altyazi | 2 | 1-3 |
| Kelime / satir | 6 | 2-12 |
| Karakter / satir | 42 | 20-60 |
| Max altyazi suresi | 5s | 2-10s |
| CPS limiti | 20 | 10-30 |

## Sorun Giderme

### Plugin "Daemon ulasilamiyor" diyor

Daemon calismiyordur. Kontrol:
```bash
curl http://127.0.0.1:53117/ping
launchctl list | grep premierecut
```

Manual start:
```bash
launchctl unload ~/Library/LaunchAgents/com.seyoweb.premierecut.daemon.plist
launchctl load ~/Library/LaunchAgents/com.seyoweb.premierecut.daemon.plist
```

Log:
```bash
tail -20 ~/Library/Logs/premierecut-daemon.log
tail -20 ~/Library/Logs/premierecut-daemon.error.log
```

### Plugin panel'de Analiz Et cevap vermiyor

Bu genelde plugin cache problemidir. Premiere Pro'yu tamamen kapatip
yeniden acin. `Cmd+Q` ile cikis yapin, sonra tekrar acin.

### whisper-cli bulunamadi

```bash
which whisper-cli
# Yoksa:
brew install whisper-cpp
```

### Premiere Developer Mode

UXP plugin gelistirirken developer mode'u acmak faydali:

Premiere Pro > Settings > Ayarlar > UXP Plugin Developer Mode

## Dosya Yapisi

```
premiere-cut/
  manifest.json           UXP plugin manifest
  package.json
  README.md
  docs/
    superpowers/specs/    Tasarim dokumani
  icons/                  Panel ikonlari
  src/
    index.html            Panel UI
    index.js              Entry point
    ui/
      styles.css
    core/
      audio-exporter.js   Premiere -> WAV (daemon)
      silence-detector.js FFmpeg silencedetect wrapper
      breath-detector.js  Nefes tespit algoritmasi
      segment-builder.js  Keep/remove segment listesi
      transcriber.js      whisper-cli wrapper
    timeline/
      sequence-editor.js  Premiere DOM ops
      duplicator.js       Sequence duplicate
      reconstructor.js    Keep-only reconstruction
    srt/
      caption-grouper.js  Word -> caption grouping
      srt-writer.js       SRT dosya yazici
      vtt-writer.js       VTT dosya yazici
    utils/
      shell.js            (legacy shim)
      daemon.js           Daemon HTTP client
      time.js             TickTime <-> seconds
      config.js           localStorage ayarlar
  daemon/
    server.js             Node.js HTTP helper
    install-daemon.sh     LaunchAgent kurulum
    uninstall-daemon.sh   Kaldirma
    com.seyoweb.premierecut.daemon.plist
```

## Bilinen Sinirlamalar

- **Tek kamera, tek konusmaci** icin optimize edilmistir
- Multi-track setup'larda sequence'deki ilk audio/video klibin kaynak
  dosyasini kullanir — trim/split'leri tam yansitmaz
- UXP'de klip `split/razor` API'si yok — kesim icin `createSetEndAction`
  + `createSetStartAction` + `createRemoveItemsAction(ripple=true)`
  kombinasyonu kullanilir
- `large-v3` modeli ~3 GB. Daha kucuk modeller (`medium`, `small`,
  `base`) daha hizli ama daha dusuk kaliteli

## Gelecek Ozellikler

- Batch processing (birden fazla klip)
- Premiere caption track'e dogrudan altyazi yazma
- Cloud STT desteg (Deepgram, AssemblyAI, OpenAI Whisper API)
- WebRTC/Silero VAD ile daha akilli nefes tespiti
- Undo/redo destegi
- Multi-speaker diarization

## Lisans

MIT — SEYO Reklam Ajansi, 2026
