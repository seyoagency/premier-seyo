# PremiereCut — Premiere Pro Auto-Cut & Auto-SRT Plugin

**Tarih:** 2026-04-16
**Platform:** Adobe Premiere Pro 2026 (UXP, v25.6+)
**Hedef:** Kisisel kullanim, ileride paylasim

---

## 1. Genel Bakis

PremiereCut, Adobe Premiere Pro icin iki temel ozellik sunan bir UXP eklentisidir:

1. **AUTO-CUT** — Sessiz alanlari ve nefes bosluklarini otomatik tespit edip keser, kalan konusma segmentlerini birlestirerek temiz bir timeline olusturur.
2. **AUTO-SRT** — Konusmalari otomatik yaziya cevirip profesyonel SRT altyazi dosyasi uretir, opsiyonel olarak Premiere caption track'e ekler.

### Kullanim Senaryosu
- Tek kamera, tek konusmaci (YouTube / podcast tarzi)
- Turkce ve Ingilizce icerik

---

## 2. Mimari

```
UXP Panel (HTML/JS/CSS)
  |-- Premiere DOM API -> sequence/clip okuma-yazma
  |-- UXP Shell API -> FFmpeg cagir (silencedetect + nefes)
  |-- UXP Shell API -> whisper.cpp cagir (STT)
  |-- UXP File API -> SRT dosya yazma
```

### Bagimliliklar (harici, sistemde kurulu olmali)
- **FFmpeg 8.x** — ses analizi ve silence detection
- **whisper.cpp + ggml-large-v3 model** — speech-to-text

### Neden UXP?
- CEP Eylul 2026'da destek kaybedecek
- UXP Premiere 25.6'da resmi olarak yayinlandi
- Modern JS motoru, dosya sistemi, ag ve shell erisimi
- UXP Hybrid Plugins (v26.2) ile native C++ addon destegi

---

## 3. AUTO-CUT Tasarimi

### 3.1 Tespit Pipeline

```
Active Sequence
    |
    v (audio export - Premiere DOM)
/tmp/premiere-cut/audio.wav (48kHz)
    |
    v
[Asama 1] FFmpeg silencedetect
  noise threshold: kullanici ayarli (-35dB varsayilan)
  min silence duration: kullanici ayarli (0.4s varsayilan)
  -> silence_start / silence_end listesi
    |
    v
[Asama 2] Nefes Filtresi (opsiyonel)
  FFmpeg bandpass 150-900Hz + enerji analizi
  -> nefes bolgeleri listesi
    |
    v
[Asama 3] Segment Uretimi
  padding: +/- 150ms (ayarli)
  min keep segment: 300ms
  min silence: 400ms
  -> keep_ranges[] ve remove_ranges[] listesi
```

### 3.2 FFmpeg Komutlari

```bash
# Sessizlik tespiti
ffmpeg -i audio.wav -af silencedetect=noise=-35dB:d=0.4 -f null - 2>&1

# Nefes tespiti (sessiz olmayan ama konusma da olmayan bolgeler)
ffmpeg -i audio.wav -af "highpass=f=150,lowpass=f=900,astats=metadata=1:reset=1" -f null - 2>&1
```

### 3.3 Timeline Kesim Stratejisi: Safe Duplicate + Reconstruct

1. Orijinal sequence'e DOKUNMA
2. Sequence'i duplicate et -> "OrijinalAdi - AutoCut"
3. Duplicate uzerinde:
   a. Her keep segment icin -> createInsertProjectItemAction() ile
      dogru in/out point'lerle klip ekle
   b. VEYA mevcut klipleri trim et + createRemoveItemsAction(ripple=true)
4. Kullanici sonucu begenmezse -> duplicate sequence'i sil

### 3.4 Kullanici Ayarlari

| Ayar | Varsayilan | Aralik | Aciklama |
|------|-----------|--------|----------|
| Sessizlik esigi (dB) | -35 | -20 ile -50 | Dusuk = daha agresif kesim |
| Min. sessizlik suresi | 0.4s | 0.2 - 2.0s | Bu kadar kisa sessizlikleri yoksay |
| Padding (once/sonra) | 150ms | 0 - 500ms | Kesim noktasinda nefes payi |
| Nefes tespiti | Acik | On/Off | Nefes seslerini de kes |
| Min. konusma suresi | 0.3s | 0.1 - 1.0s | Cok kisa sesleri yoksay |

---

## 4. AUTO-SRT Tasarimi

### 4.1 Transkripsiyon Pipeline

```
Active Sequence
    |
    v (audio export)
/tmp/premiere-cut/audio-srt.wav (16kHz mono)
    |
    v
whisper.cpp
  model: large-v3 (veya kullanici secimi)
  language: auto-detect / tr / en
  output: JSON (word-level timestamps)
    |
    v
Caption Grouping Engine
  -> SRT / VTT dosyasi
  -> Opsiyonel: Premiere caption track
```

### 4.2 Altyazi Bicimlendirme Ayarlari

| Ayar | Varsayilan | Aralik | Aciklama |
|------|-----------|--------|----------|
| Max satir / altyazi | 2 | 1 - 3 | Her altyazi kac satir |
| Max kelime / satir | 6 | 2 - 12 | Satir basina kelime limiti |
| Max karakter / satir | 42 | 20 - 60 | Satir genisligi |
| Max altyazi suresi | 5s | 2 - 10s | Ekranda kalma suresi |
| Min altyazi suresi | 1s | 0.5 - 3s | Cok hizli gecisi engelle |
| CPS limiti | 20 | 10 - 30 | Karakter/saniye okunabilirlik |
| Cumle sonunda bol | Acik | On/Off | Noktalama noktalarinda bolme |
| Dogal duraklarda bol | Acik | On/Off | Konusma duraklamalarinda bol |

### 4.3 Gruplama Algoritmasi

```
1. Whisper'dan word-level timestamps al
2. Kelimeleri sirali isle:
   a. Mevcut satira kelime ekle
   b. Karakter limiti asilirsa -> yeni satir
   c. Satir limiti asilirsa -> yeni altyazi
   d. Kelime limiti asilirsa -> yeni satir
   e. Cumle sonu isareti (. ? !) -> altyaziyi kapat
   f. Dogal durakla (>500ms gap) -> altyaziyi kapat
3. CPS kontrolu: altyazi suresi / karakter sayisi <= CPS limiti
4. Min/max sure kontrolleri uygula
```

### 4.4 Cikti Formatlari

- **SRT** (.srt) — Varsayilan, evrensel uyumluluk
- **VTT** (.vtt) — Web uyumlu
- **Premiere Caption Track** — Dogrudan timeline'a ekle

---

## 5. Panel UI Tasarimi

Sade, profesyonel, karanlik tema. Adobe Spectrum Web Components.

Iki sekmeli panel:
- **AUTO-CUT** sekmesi: Slider'lar + analiz butonu + onizleme + uygula butonu
- **AUTO-SRT** sekmesi: Dil/model secimi + bicimlendirme ayarlari + transkript butonu + onizleme + kaydet butonu

### Onemli UI Elemanlari
- Analiz sonrasi istatistik gosterimi (kac bolge, kac saniye kesilecek)
- Onizleme alani (segmentlerin gorsellesmesi)
- Progress bar (FFmpeg ve Whisper islemleri icin)
- Ayarlari hatirla (UXP storage)

---

## 6. Dosya Yapisi

```
premiere-cut/
  manifest.json           # UXP plugin manifest
  package.json
  src/
    index.html            # Panel UI
    index.js              # Entry point
    ui/
      panel.js            # Panel controller
      styles.css          # Spectrum-uyumlu stiller
    core/
      audio-exporter.js   # Premiere -> WAV export
      silence-detector.js # FFmpeg silencedetect wrapper
      breath-detector.js  # Nefes tespiti
      segment-builder.js  # Keep/remove segment listesi
      transcriber.js      # whisper.cpp wrapper
    timeline/
      sequence-editor.js  # Premiere DOM timeline ops
      duplicator.js       # Sequence duplicate
      reconstructor.js    # Keep-only reconstruction
    srt/
      caption-grouper.js  # Word -> caption grouping
      srt-writer.js       # SRT dosya yazici
      vtt-writer.js       # VTT dosya yazici
    utils/
      shell.js            # UXP Shell API wrapper
      time.js             # TickTime <-> seconds cevrim
      config.js           # Kullanici ayarlari (UXP storage)
  icons/
    icon-light.png
    icon-dark.png
```

Not: UXP Premiere eklentilerinde TypeScript compile gerektiren karmasik bir build pipeline yerine, dogrudan JavaScript (ES2020+) kullaniyoruz. UXP modern JS destekliyor.

---

## 7. Teknik Kisitlar ve Cozumler

| Kisit | Cozum |
|-------|-------|
| UXP'de split/razor API yok | Duplicate sequence + trim + ripple delete |
| UXP'de audio data erisimi yok | FFmpeg ile harici ses analizi |
| UXP browser degil, Web Audio API yok | FFmpeg bandpass filter ile nefes tespiti |
| whisper.cpp sisteme kurulu olmali | Ilk calistirmada kontrol + kurulum kilavuzu |
| FFmpeg sisteme kurulu olmali | Ilk calistirmada kontrol + kurulum kilavuzu |

---

## 8. Oncelik Sirasi (MVP)

1. **P0** — Sessizlik tespiti + timeline kesim (AUTO-CUT temel)
2. **P0** — SRT uretimi (AUTO-SRT temel)
3. **P1** — Nefes tespiti
4. **P1** — Premiere caption track import
5. **P2** — VTT cikti
6. **P2** — Batch processing (birden fazla klip)
