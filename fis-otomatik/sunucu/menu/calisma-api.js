/* Çalışma saatleri API endpoint'leri
   GET /panel/calisma - Mevcut ayarı döndür (panel için)
   POST /panel/calisma - Ayar kaydet (yalnız PANEL_YONETICI 'levent')
   GET /calisma/elle - Manuel durum override (acik:true/false, mesaj)
   POST /calisma/elle - Manuel durum kaydet
   GET /calisma/saatler - Otomatik çalışma saatleri ayarı
   
   Ayar dosyası: AYAR_DIZIN/calisma.json
   Manuel override: AYAR_DIZIN/elle.json (varsa öncelikli) */

const fs = require('fs').promises;
const path = require('path');
const saat = require('./saat.js');

const AYAR_DIZIN = process.env.AYAR_DIZIN || path.join(__dirname, '../../ayarlar');
const AYAR_DOSYA = path.join(AYAR_DIZIN, 'calisma.json');
const ELLE_DOSYA = path.join(AYAR_DIZIN, 'elle.json');

/* Varsayılan ayar (ilk kurulum) */
const VARSAYILAN = {
  hafta_ici: {ac: 9*60, kapa: 19*60},
  hafta_sonu: {ac: 9*60, kapa: 19*60},
  kapali_gunler: []
};

/* Ayar dosyasını oku */
async function ayarOku() {
  try {
    const data = await fs.readFile(AYAR_DOSYA, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    if (e.code === 'ENOENT') return VARSAYILAN;
    throw e;
  }
}

/* Ayar dosyasına yaz */
async function ayarYaz(ayar) {
  await fs.mkdir(AYAR_DIZIN, {recursive: true});
  await fs.writeFile(AYAR_DOSYA, JSON.stringify(ayar, null, 2), 'utf8');
}

/* Manuel override oku */
async function elleOku() {
  try {
    const data = await fs.readFile(ELLE_DOSYA, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

/* Manuel override yaz */
async function elleYaz(elle) {
  await fs.mkdir(AYAR_DIZIN, {recursive: true});
  if (elle === null) {
    try {
      await fs.unlink(ELLE_DOSYA);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  } else {
    await fs.writeFile(ELLE_DOSYA, JSON.stringify(elle, null, 2), 'utf8');
  }
}

/* GET /calisma/saatler - Otomatik ayar */
async function saatlerGet(req, res) {
  try {
    const ayar = await ayarOku();
    res.json(ayar);
  } catch (e) {
    res.status(500).json({hata: 'Ayar okunamadı'});
  }
}

/* GET /calisma/elle - Manuel override */
async function elleGet(req, res) {
  try {
    const elle = await elleOku();
    res.json(elle || {yok: true});
  } catch (e) {
    res.status(500).json({hata: 'Elle ayar okunamadı'});
  }
}

/* POST /calisma/elle - Manuel override kaydet (admin) */
async function ellePost(req, res) {
  if (!req.panelYonetici) {
    return res.status(403).json({hata: 'Yetki gerekli'});
  }
  
  try {
    const elle = req.body;
    if (elle && elle.kapat !== undefined) {
      // Kapat veya aç
      if (elle.kapat) {
        await elleYaz({acik: false, mesaj: elle.mesaj || 'Şu an kapalıyız.'});
      } else {
        await elleYaz(null); // Temizle
      }
    }
    res.json({ok: true});
  } catch (e) {
    res.status(500).json({hata: 'Kayıt başarısız'});
  }
}

/* GET /panel/calisma - Panel için ayar (admin) */
async function panelGet(req, res) {
  if (!req.panelYonetici) {
    return res.status(403).json({hata: 'Yetki gerekli'});
  }
  
  try {
    const ayar = await ayarOku();
    const elle = await elleOku();
    res.json({ayar, elle});
  } catch (e) {
    res.status(500).json({hata: 'Ayar okunamadı'});
  }
}

/* POST /panel/calisma - Panel ayar kaydet (admin, yalnız levent) */
async function panelPost(req, res) {
  if (!req.panelYonetici || req.kullanici !== 'levent') {
    return res.status(403).json({hata: 'Yalnız panel yöneticisi (levent) kaydedebilir'});
  }
  
  try {
    const ayar = req.body;
    
    // Doğrula
    const hata = saat.ayarDogrula(ayar);
    if (hata) {
      return res.status(400).json({hata});
    }
    
    await ayarYaz(ayar);
    res.json({ok: true});
  } catch (e) {
    res.status(500).json({hata: 'Kayıt başarısız'});
  }
}

/* GET /durum - Sepet için açık/kapalı durumu (herkes) */
async function durumGet(req, res) {
  try {
    // Önce elle override
    const elle = await elleOku();
    if (elle && elle.acik !== undefined) {
      return res.json({
        acik: elle.acik,
        mesaj: elle.mesaj || (elle.acik ? 'Açığız' : 'Kapalıyız'),
        kapali_urunler: []
      });
    }
    
    // Otomatik saat
    const ayar = await ayarOku();
    const d = saat.durum(ayar);
    res.json({
      acik: d.acik,
      mesaj: d.mesaj,
      kapali_urunler: []
    });
  } catch (e) {
    res.status(500).json({hata: 'Durum okunamadı'});
  }
}

module.exports = {
  saatlerGet,
  elleGet,
  ellePost,
  panelGet,
  panelPost,
  durumGet,
  ayarOku,
  ayarYaz
};
