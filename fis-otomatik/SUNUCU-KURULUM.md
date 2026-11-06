# Sunucu Kurulum Kılavuzu

Bu dosya `fis-otomatik` dizinindeki panel ve API dosyalarının sunucuya kurulumu için adım adım talimatlar içerir.

## 📁 Dizin Yapısı

```
/sunucu/dizin/
├── sunucu/
│   ├── menu/
│   │   ├── saat.js              (çalışma saatleri mantığı)
│   │   └── calisma-api.js       (API endpoint'leri)
│   └── panel/
│       ├── index.html           (panel ana sayfa)
│       ├── panel.css            (panel stilleri)
│       ├── calisma-saatleri.html (çalışma saatleri sayfası)
│       └── calisma-saatleri.js  (client-side logic)
└── ayarlar/
    ├── calisma.json             (çalışma saatleri ayarı)
    └── elle.json                (manuel override, opsiyonel)
```

## 🚀 Kurulum Adımları

### 1. Dosyaları Kopyala

```bash
# Repo'dan sunucuya
cd /sunucu/dizin
git clone https://github.com/leventbiyiklioglu/senocak-cafe.git temp
cp -r temp/fis-otomatik/sunucu/* sunucu/
rm -rf temp
```

### 2. Ayar Dizinini Oluştur

```bash
mkdir -p /sunucu/dizin/ayarlar
chmod 755 /sunucu/dizin/ayarlar
```

### 3. İlk Çalışma Saatleri Ayarını Kaydet

**09.11.2026 12:00 TSI'ye kadar kapalı:**

```bash
cat > /sunucu/dizin/ayarlar/calisma.json << 'EOF'
{
  "hafta_ici": {
    "ac": 540,
    "kapa": 1140
  },
  "hafta_sonu": {
    "ac": 540,
    "kapa": 1140
  },
  "kapali_gunler": [],
  "gecici": {
    "baslangic": "2026-11-05T21:00:00.000Z",
    "bitis": "2026-11-09T09:00:00.000Z",
    "aciklama": "Geçici kapalılık"
  }
}
EOF
```

**Tarih açıklaması:**
- `2026-11-05T21:00:00.000Z` = 06.11.2026 00:00 İstanbul (UTC+3)
- `2026-11-09T09:00:00.000Z` = 09.11.2026 12:00 İstanbul (UTC+3)

### 4. Ortam Değişkenini Ayarla

**`.env` veya sunucu başlatma scripti:**

```bash
export AYAR_DIZIN=/sunucu/dizin/ayarlar
```

veya Node.js'te:

```javascript
process.env.AYAR_DIZIN = '/sunucu/dizin/ayarlar';
```

### 5. Express Routing Ekle

**Ana sunucu dosyasında (örn: `server.js`):**

```javascript
const express = require('express');
const calismaApi = require('./sunucu/menu/calisma-api');
const app = express();

// Middleware
app.use(express.json());

// Panel yetki kontrolü (basit örnek - gerçekte JWT/session kullanın)
function panelAuth(req, res, next) {
  // Basit PIN kontrolü (üretimde daha güvenli yöntem kullanın)
  const auth = req.headers['x-panel-pin'];
  if (auth === '7039') {
    req.panelYonetici = true;
    req.kullanici = 'levent';
    next();
  } else {
    res.status(403).json({hata: 'Yetki gerekli'});
  }
}

// API endpoint'leri
app.get('/durum', calismaApi.durumGet);
app.get('/calisma/saatler', calismaApi.saatlerGet);
app.get('/calisma/elle', calismaApi.elleGet);
app.post('/calisma/elle', panelAuth, calismaApi.ellePost);
app.get('/panel/calisma', panelAuth, calismaApi.panelGet);
app.post('/panel/calisma', panelAuth, calismaApi.panelPost);

// Panel statik dosyaları
app.use('/panel', express.static('sunucu/panel'));

app.listen(3000, () => {
  console.log('Sunucu 3000 portunda çalışıyor');
});
```

### 6. Nginx Yapılandırması (Opsiyonel)

**Eğer nginx kullanıyorsanız:**

```nginx
location /durum {
    proxy_pass http://localhost:3000;
}

location /panel/ {
    auth_basic "Panel Erişimi";
    auth_basic_user_file /etc/nginx/.htpasswd;
    proxy_pass http://localhost:3000/panel/;
}
```

### 7. Testleri Çalıştır

```bash
cd /sunucu/dizin
node fis-otomatik/test-calisma.js
```

Beklenen çıktı:
```
✅ 23 test başarıyla geçti
```

## 🔐 Güvenlik

### Panel PIN Değiştirme

`sunucu/panel/calisma-saatleri.js` dosyasında satır 16:

```javascript
if (girdi === '7039') { // Örnek PIN (gerçekte sunucu tarafında kontrol edilmeli)
```

PIN'i değiştirin ve sunucu tarafında `panelAuth` middleware'inde aynı PIN'i kullanın.

### Üretim Önerileri

1. **JWT Token:** PIN yerine JWT tabanlı kimlik doğrulama kullanın
2. **HTTPS:** Panel erişimi yalnız HTTPS üzerinden olsun
3. **Rate Limiting:** API endpoint'lerine rate limit ekleyin
4. **Firewall:** Panel URL'lerine yalnız güvenilir IP'lerden erişim verin

## 🧪 Ayar Doğrulama

### Manuel Test

**Terminal'de:**

```bash
node -e "
const saat = require('./sunucu/menu/saat.js');
const fs = require('fs');
const ayar = JSON.parse(fs.readFileSync('ayarlar/calisma.json', 'utf8'));
const durum = saat.durum(ayar);
console.log('Durum:', durum);
"
```

Beklenen çıktı (06.11-09.11 arası):
```
Durum: {
  acik: false,
  mesaj: 'Şu an kapalıyız, 09.11.2026 12:00\'de açılıyoruz.',
  gecici: true
}
```

### API Test

**curl ile:**

```bash
# Durum kontrolü (herkes erişebilir)
curl http://localhost:3000/durum

# Panel ayarları (yetki gerekli)
curl -H "x-panel-pin: 7039" http://localhost:3000/panel/calisma
```

## 📊 Ayar Şeması Detayları

### Dakika Hesaplaması

- `ac` ve `kapa` dakika cinsinden (0-1440)
- Örnek: `540` = 09:00 (9 × 60)
- Örnek: `1140` = 19:00 (19 × 60)

### Gün Numaraları

```
0 = Pazartesi
1 = Salı
2 = Çarşamba
3 = Perşembe
4 = Cuma
5 = Cumartesi
6 = Pazar
```

### Geçici Kapalılık Tarih Formatı

- **ISO 8601:** `YYYY-MM-DDTHH:mm:ss.sssZ`
- **UTC:** Her zaman Z ile bitir
- **İstanbul → UTC:** 3 saat çıkar (örn: 12:00 → 09:00Z)

## 🔄 Güncelleme ve Bakım

### Ayarları Güncelleme

1. Panel'den: `https://fis.senocakcafe.com/panel/calisma-saatleri.html`
2. Manuel: `ayarlar/calisma.json` dosyasını düzenle
3. API ile: `POST /panel/calisma`

### Geçici Kapalılığı Kaldırma

**Panel'den** "Kaldır" butonu veya **manuel:**

```bash
# calisma.json'dan gecici alanını kaldır veya null yap
cat > /sunucu/dizin/ayarlar/calisma.json << 'EOF'
{
  "hafta_ici": {"ac": 540, "kapa": 1140},
  "hafta_sonu": {"ac": 540, "kapa": 1140},
  "kapali_gunler": [],
  "gecici": null
}
EOF
```

### Log İzleme

Sunucu loglarında şunu görmelisiniz:

```
GET /durum 200 - - 12.345 ms
POST /panel/calisma 200 - - 23.456 ms
```

## 🐛 Sorun Giderme

### "Ayar okunamadı" Hatası

1. `AYAR_DIZIN` ortam değişkenini kontrol et
2. `ayarlar/calisma.json` dosyasının var olduğunu doğrula
3. Dosya izinlerini kontrol et: `chmod 644 ayarlar/calisma.json`

### "Yetki gerekli" Hatası

1. PIN'in doğru olduğunu kontrol et
2. `panelAuth` middleware'inin çağrıldığını doğrula
3. Header'ı kontrol et: `x-panel-pin: 7039`

### Geçici Kapalılık Çalışmıyor

1. Tarih formatını kontrol et (ISO 8601, UTC)
2. `baslangic < bitis` olduğunu doğrula
3. Sunucu saatini kontrol et: `date -u` (UTC)
4. Test et: `node fis-otomatik/test-calisma.js`

## 📞 Destek

Sorun yaşarsanız:

1. Testleri çalıştır: `node fis-otomatik/test-calisma.js`
2. API'yi test et: `curl http://localhost:3000/durum`
3. Logları kontrol et
4. GitHub issue aç: https://github.com/leventbiyiklioglu/senocak-cafe/issues
