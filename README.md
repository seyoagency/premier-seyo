# PremierSEYO

> Adobe Premiere Pro 2026 için **Auto-Cut** (sessizlik kesimi) + **Auto-SRT** (altyazı üretimi) eklentisi.
> Deepgram Nova-3 ile Türkçe ve çoklu dil desteği. macOS + Windows 10/11 x64.

[![Premiere Pro](https://img.shields.io/badge/Premiere%20Pro-25.6%2B-9999FF?logo=adobepremierepro&logoColor=white)](https://www.adobe.com/products/premiere.html)
[![Deepgram Nova-3](https://img.shields.io/badge/Deepgram-Nova--3-13EF93?logo=deepgram&logoColor=black)](https://deepgram.com)
[![License: MIT](https://img.shields.io/badge/license-MIT-d4ff3a)](LICENSE)

## Özellikler

- **Auto-Cut** — Konuşma dışı sessizlikleri ve nefes seslerini timeline üzerinde otomatik tespit eder, tek tuşla keser.
- **Auto-SRT** — Word-level timestamp ile yüksek kaliteli altyazı (SRT/VTT). Otomatik dil tespiti veya manuel seçim (TR, EN, DE, FR, ES + diğerleri).
- **Tek istek, çift sonuç** — Auto-Cut sonrası Auto-SRT yapılırsa daemon aynı Deepgram cevabını cache'ten kullanır. Maliyet ve gecikme yarılır.
- **Sıfır data dışarı çıkışı** — API key sadece kendi makinende dosyada saklanır (macOS: `~/.config/premier-seyo/`, Windows: `%APPDATA%\PremierSEYO\`).

---

## Hızlı Kurulum (Claude Code ile)

> Claude Code'a şu komutu söyle:
>
> _"Şu repoyu klonla ve Premiere Pro için kurulumu yap: https://github.com/seyoagency/premier-seyo"_

Claude Code aşağıdaki adımları otomatik yapar:

1. `git clone https://github.com/seyoagency/premier-seyo.git ~/premier-seyo`
2. `cd ~/premier-seyo && ./daemon/install-daemon.sh`
3. Script Deepgram API key'i sorar (script çalıştığında interaktif girersin)
4. Plugin Premiere'in UXP dizinine kopyalanır
5. Premiere Pro'yu **Cmd+Q** ile tam kapat → tekrar aç
6. **Window > UXP Plugins > PremierSEYO > PremierSEYO**

---

## macOS Kurulum (Önerilen — tek komut)

Terminal'i aç (Cmd+Space → "Terminal" yaz → Enter), şu komutu yapıştır + Enter:

```bash
curl -fsSL https://raw.githubusercontent.com/seyoagency/premier-seyo/master/install-mac.sh | bash
```

Script şunları otomatik yapar (3-5 dakika):
- Xcode Command Line Tools (yoksa kurar — bir GUI dialog çıkar)
- Homebrew (yoksa kurar — Mac'in standart paket yöneticisi)
- FFmpeg + Node.js (brew ile kurar)
- PremierSEYO repo'yu indirip helper daemon'u **LaunchAgent** olarak başlatır
- Premiere UXP plugin dizinine eklentiyi kopyalar

Bittiğinde **Premiere Pro'yu Cmd+Q ile tam kapat → tekrar aç** → **Window > UXP Plugins > PremierSEYO > PremierSEYO** → sağ üst ⚙ → Deepgram API key gir → "Kaydet ve Bağlan".

> **Not (Apple Silicon vs Intel)**: Script otomatik mimarini tespit eder, doğru ffmpeg/node sürümünü kurar. Ayar yapmana gerek yok.

### Manuel Kurulum (geliştiriciler için)

Tek komutu kullanmak istemezsen veya kaynak koddan derlemek için:

```bash
brew install ffmpeg node
git clone https://github.com/seyoagency/premier-seyo.git ~/premier-seyo
cd ~/premier-seyo
./daemon/install-daemon.sh
```

Script şunları yapar:
- Bağımlılık kontrolü (Node.js, FFmpeg)
- Eski kurulum varsa otomatik migrate (`~/.config/premiere-cut/` → `~/.config/premier-seyo/`)
- Deepgram API key prompt (girmek zorunda değilsin, eklentide ayarlardan da girebilirsin)
- macOS LaunchAgent kurulumu (Mac her açılınca daemon otomatik başlar)
- Plugin'i Premiere UXP install dizinine kopyalar (`npm run build`)

## Windows Kurulum

Windows dağıtımı tek tık installer olarak hazırlanır:

```text
PremierSEYO-Setup-x64-<version>.exe
```

Installer şunları yapar:
- PremierSEYO daemon dosyalarını `%LOCALAPPDATA%\Programs\PremierSEYO` altına kurar.
- Deepgram key ve token dosyaları için `%APPDATA%\PremierSEYO` kullanır.
- Logları `%LOCALAPPDATA%\PremierSEYO\logs` altına yazar.
- Daemon'u kullanıcı oturumunda otomatik başlatmak için `PremierSEYO Daemon` HKCU Run kaydını oluşturur.
- Bundled `PremierSEYO.ccx` dosyasını Adobe UPIA ile kurar.

Gereksinimler:
- Windows 10/11 x64
- Premiere Pro 25.6+
- Creative Cloud Desktop / UPIA kurulu ve çalışabilir durumda

### 3. Premiere Pro

- Premiere Pro çalışıyorsa **Cmd+Q** ile tam kapat → tekrar aç (UXP plugin cache).
- **Window > UXP Plugins > PremierSEYO > PremierSEYO** ile paneli aç.

---

## Deepgram API Key Alma (Ücretsiz · 200 USD Kredi)

1. [console.deepgram.com](https://console.deepgram.com) → **Sign up** (Google/GitHub ile)
2. Sol menüden **API Keys** → **Create a New API Key**
3. **Permission**: "Member" seç
4. Key'i kopyala (sadece bir kez gösterilir, kayıp olursa yenisini oluştur)
5. Kuruluma yapıştır:
   - `install-daemon.sh` çalışırken sorduğunda yapıştır, **veya**
   - Eklenti açıldıktan sonra header'daki ⚙ → API Key alanına yapıştır → **Kaydet ve Bağlan**

Kaynak yeni bir hesap için **200 USD ücretsiz kredi** veriyor (≈ 200 saat transkripsiyon). Türkçe Nova-3 desteği Ocak 2026'da geldi.

---

## Kullanım

### Auto-Cut

1. Premiere'de sequence aç, kesmek istediğin klipleri timeline'a ekle.
2. PremierSEYO panelinde **AUTO·CUT** sekmesi.
3. **Sessizlik eşiği** (varsayılan -40 dB) ve **Min sessizlik** (0.4 sn) ayarla.
4. **Analiz Et** → sessizlik bölgeleri tespit edilir, waveform'da gösterilir.
5. **Kes ve Birleştir** → modal uyarısı çıkar:
   > **DİKKAT:** Auto-Cut aktif sequence'i yerinde keser. Önce sequence'in kopyasını al (Project paneli → sağ tık → "Duplicate"), sonra "Kopya aldım, devam et"e bas.
6. Kesim tamamlanır. Hata olursa Cmd+Z ile geri al (birden fazla undo gerekebilir).

### Auto-SRT

1. **AUTO·SRT** sekmesi.
2. **Dil** seç (Otomatik / Türkçe / English / Deutsch / Français / Español).
3. **Altyazı Biçimi**: satır sayısı (1-3) + satır başına kelime (2-12) ayarla.
4. **Çıktı formatı**: SRT, VTT (her ikisi de seçilebilir).
5. **Transkript Et** → Deepgram Nova-3 çağrılır (≈ 30 saniye).
6. Önizleme incele → **Kaydet**.

Çıktılar:
- `~/Documents/PremierSEYO/<sequence-adi>.srt` (ve `.vtt`)
- Aynı dosya proje paneline otomatik import edilir → timeline'a sürükle, ekle.

---

## Sorun Giderme

### "Daemon ulaşılamıyor"

```bash
launchctl list | grep premierseyo
launchctl unload ~/Library/LaunchAgents/com.seyoweb.premierseyo.daemon.plist
launchctl load   ~/Library/LaunchAgents/com.seyoweb.premierseyo.daemon.plist
tail -20 ~/Library/Logs/premierseyo-daemon.log
```

Veya tek komutla yeniden kur:
```bash
cd ~/premier-seyo && ./daemon/install-daemon.sh
```

### Plugin yenilenmiyor (yeni versiyon yüklenmiyor)

UXP plugin'leri Premiere açılışında cache'lenir. **Cmd+Q ile Premiere'i tam kapat** (Window'u kapatmak yetmez), sonra tekrar aç.

### Deepgram key geçersiz / "Bağlandı" yazmıyor

1. Header sağdaki ⚙ → drawer aç.
2. API Key alanına yeni key yapıştır.
3. **Bağlantıyı Test Et** → "Test başarılı · henüz kaydedilmedi" görmelisin.
4. **Kaydet ve Bağlan** → key'i diske yazar, daemon hazır.

Key'in geçerli olduğundan emin değilsen [console.deepgram.com](https://console.deepgram.com) → **Usage** sayfasından kontrol et.

### "Aylık limit doldu"

Deepgram ücretsiz hesap aylık 200 USD kredi sunuyor (~200 saat transkripsiyon). Aşıldıysa:
- Aynı hesapla bir sonraki ayı bekle, **veya**
- Yeni bir Deepgram hesabı aç, yeni key oluştur, drawer'da güncelle.

### Auto-Cut hatası: "Orijinal klipler silinemedi"

UXP state refresh gecikmesi. Önce Premiere'i tam kapat → aç → tekrar dene. Olmazsa sequence'i kopyala (yeni sequence olarak), eskiyi kapat, yeni üzerinde dene.

---

## Geliştirme

```bash
git clone https://github.com/seyoagency/premier-seyo.git
cd premier-seyo

# Dependency yok — Node built-in modüller dışında nothing.
# Sadece esbuild npx ile çalışır (npm install gerekmez).

npm run build        # bundle + inline + UXP install dizinine deploy
npm run build:assets # sadece bundle + inline
npm run package:win  # Windows staging klasörünü hazırla
npm run installer:win # Windows NSIS installer üret
npm run bundle       # esbuild src/index.js → src/bundle.js
npm run inline       # bundle.js + styles.css → src/index.html'e göm
npm run deploy       # rsync → ~/Library/Application Support/Adobe/UXP/Plugins/External/...
```

### Mimari

```
┌──────────────────────────────────────────────────────────────┐
│  UXP Panel (Premiere Pro)                                    │
│  src/index.html (CSS + JS inline)                            │
│  premierepro DOM API                                         │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTP fetch (token auth)
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  Helper Daemon (Node.js, port 53117)                         │
│  daemon/server.js + deepgram-client.js                       │
│  macOS LaunchAgent / Windows HKCU Run                        │
└──────────────────────┬─────────────────┬─────────────────────┘
                       │                 │
                       ▼                 ▼
                ┌──────────┐       ┌──────────┐
                │ Deepgram │       │  FFmpeg  │
                │  Nova-3  │       │  (mix)   │
                └──────────┘       └──────────┘
```

UXP `child_process` yasakladığı için tüm shell işleri (FFmpeg + Deepgram REST) bu daemon üzerinden yapılır. Daemon dependency-free — sadece Node built-in modüller.

### Dosya Yapısı

```
premier-seyo/
├── manifest.json              UXP plugin manifest
├── package.json
├── README.md
├── daemon/
│   ├── server.js              HTTP endpoints (53117)
│   ├── deepgram-client.js     Deepgram REST + cache
│   ├── platform.js            macOS/Windows path + runtime helpers
│   ├── command-runner.js      shell'siz process runner
│   ├── install-daemon.sh      Migration aware setup
│   ├── uninstall-daemon.sh    --purge mode
│   └── com.seyoweb.premierseyo.daemon.plist
├── installer/windows/         NSIS + PowerShell Windows installer
├── src/
│   ├── index.html             Panel UI (build çıktısında inline)
│   ├── index.js               Entry point
│   ├── ui/styles.css
│   ├── core/                  audio export, silence/breath detect, segment build
│   ├── timeline/              sequence editor, reconstructor, mapper
│   ├── srt/                   caption grouper, SRT/VTT writer
│   └── utils/                 daemon HTTP client, time, config
├── icons/                     Panel ikonları
└── scripts/
    ├── inline-assets.js       bundle + CSS → HTML inline
    └── deploy-plugin.js       rsync → UXP install dizini
```

---

## Kaldırma

```bash
cd ~/premier-seyo

# Sadece daemon stop:
./daemon/uninstall-daemon.sh

# Tam temizlik (config + key + log + plugin install dizini):
./daemon/uninstall-daemon.sh --purge
```

`--purge` modu hem `premier-seyo` hem eski `premiere-cut` artefactlarını temizler.

---

## Bilinen Sınırlamalar

- **Windows x64-only** — İlk Windows installer ARM64 hedeflemez.
- **Windows installer unsigned** — Code signing sertifikası eklenene kadar SmartScreen uyarısı görülebilir.
- **Tek konuşmacı** için optimize. Multi-speaker diarization (Deepgram `diarize=true`) henüz açık değil.
- **Auto-Cut yerinde keser** — UXP API'si programatik sequence duplicate desteklemediği için kesim aktif sequence üzerinde yapılır. Cmd+Z birden fazla undo gerektirir; bu yüzden modal uyarı her seferinde gösterilir. **Önce mutlaka sequence kopyası al.**
- **Premiere 2026 (25.6+)** — Daha eski sürümlerde UXP API'leri eksik olabilir.

---

## Yol Haritası

- [ ] Multi-speaker diarization UI'sı
- [ ] Keyterm Prompting paneli (jargon/marka sözlüğü)
- [ ] Streaming Deepgram (uzun videolar için progressive transcription)
- [ ] Premiere caption track'e doğrudan altyazı yazma
- [ ] Batch processing (birden fazla klip)

---

## Lisans

MIT — © 2026 [SEYO Reklam Ajansı](https://seyoweb.com)

Detay: [LICENSE](LICENSE)

---

## Katkı

Issue + PR açabilirsin. Soru/öneri için: info@seyoweb.com
