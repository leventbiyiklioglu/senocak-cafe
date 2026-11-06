/* Çalışma saatleri mantığı - Europe/Istanbul (UTC+3 sabit)
   Ayar şeması (geriye dönük uyumlu):
   - Eski: {hafta_ici:{ac,kapa}, hafta_sonu:{ac,kapa}, kapali_gunler:[0..6]}
   - Yeni: {gunler:[7 gün için {ac,kapa}|null], gecici:{baslangic,bitis,aciklama}|null}
   gunler varsa öncelikli; yoksa eski mantık. Pazartesi=0, Pazar=6.
   gecici: ISO 8601 tarih (Europe/Istanbul yorumlanır), aralık içinde kapalı. */

const TZ = 'Europe/Istanbul';

/* Tarih Europe/Istanbul'da yorumla (ISO → milisaniye) */
function isoIstanbul(iso) {
  if (!iso || typeof iso !== 'string') return null;
  // ISO 8601 (YYYY-MM-DDTHH:mm:ss veya YYYY-MM-DDTHH:mm:ss.sssZ)
  // Z varsa UTC, yoksa lokal. Biz her zaman Istanbul olarak yorumluyoruz.
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.getTime();
}

/* Şu anki Europe/Istanbul saati ve tarih bilgileri */
function istanbulSimdi(now) {
  const d = now || new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false
  }).formatToParts(d);
  
  const get = (type) => parts.find(p => p.type === type).value;
  const gun = get('day');
  const ay = get('month');
  const yil = get('year');
  const saat = parseInt(get('hour'), 10);
  const dakika = parseInt(get('minute'), 10);
  const saniye = parseInt(get('second'), 10);
  
  // weekday: Mon=1, Tue=2, ..., Sun=0
  const gunAdi = get('weekday'); // Mon, Tue, ...
  const gunMap = {Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5, Sun:6};
  const gunNo = gunMap[gunAdi];
  
  return {
    tarih: `${gun}.${ay}.${yil}`,
    saat: `${saat.toString().padStart(2,'0')}:${dakika.toString().padStart(2,'0')}`,
    gun: gunNo,
    saatDakika: saat * 60 + dakika,
    ms: d.getTime()
  };
}

/* Gün aralığı hesapla (Pazartesi=0 → Pazar=6) */
function gunAraligi(gun, ayar) {
  // Önce gunler varsa
  if (ayar.gunler && Array.isArray(ayar.gunler) && ayar.gunler.length === 7) {
    const g = ayar.gunler[gun];
    if (g === null) return null; // Kapalı
    if (g && typeof g.ac === 'number' && typeof g.kapa === 'number') {
      return {ac: g.ac, kapa: g.kapa};
    }
  }
  
  // Eski şema
  const kapali = ayar.kapali_gunler || [];
  if (kapali.includes(gun)) return null;
  
  const haftaici = ayar.hafta_ici || {ac: 9*60, kapa: 19*60};
  const haftasonu = ayar.hafta_sonu || haftaici;
  
  return (gun >= 5) ? haftasonu : haftaici; // 5=Cmt, 6=Paz
}

/* Geçici kapalılık kontrolü */
function geciciKapali(ms, ayar) {
  if (!ayar.gecici) return null;
  const g = ayar.gecici;
  const bas = isoIstanbul(g.baslangic);
  const bit = isoIstanbul(g.bitis);
  if (bas === null || bit === null || bas >= bit) return null;
  
  if (ms >= bas && ms < bit) {
    // Kapalı aralık içinde
    const bitisStr = new Intl.DateTimeFormat('tr-TR', {
      timeZone: TZ,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(bit));
    
    return {
      aciklama: g.aciklama || '',
      mesaj: `Şu an kapalıyız, ${bitisStr}'de açılıyoruz.`
    };
  }
  
  return null;
}

/* Şu anki durum: açık mı kapalı mı + mesaj */
function durum(ayar, simdi) {
  const s = simdi || istanbulSimdi();
  
  // Önce geçici kapalılık
  const gec = geciciKapali(s.ms, ayar);
  if (gec) {
    return {
      acik: false,
      mesaj: gec.mesaj,
      gecici: true
    };
  }
  
  // Normal çalışma saatleri
  const aralik = gunAraligi(s.gun, ayar);
  if (!aralik) {
    return {acik: false, mesaj: 'Bugün kapalıyız.', gecici: false};
  }
  
  const acik = s.saatDakika >= aralik.ac && s.saatDakika < aralik.kapa;
  const acStr = Math.floor(aralik.ac/60).toString().padStart(2,'0') + ':' + (aralik.ac%60).toString().padStart(2,'0');
  const kapaStr = Math.floor(aralik.kapa/60).toString().padStart(2,'0') + ':' + (aralik.kapa%60).toString().padStart(2,'0');
  
  return {
    acik,
    mesaj: acik ? `Açığız (${acStr}–${kapaStr})` : `Kapalıyız, ${acStr}–${kapaStr}`,
    gecici: false
  };
}

/* Sonraki açılış zamanı (geçici kapalılık veya normal saat) */
function sonrakiAcilis(ayar, simdi) {
  const s = simdi || istanbulSimdi();
  
  // Geçici kapalılık varsa ve içindeyse, bitiş zamanı
  const gec = geciciKapali(s.ms, ayar);
  if (gec) {
    const bit = isoIstanbul(ayar.gecici.bitis);
    return new Date(bit);
  }
  
  // Normal çalışma saatlerine göre
  const aralik = gunAraligi(s.gun, ayar);
  if (aralik && s.saatDakika < aralik.ac) {
    // Bugün henüz açılmadı
    return null; // Bugünkü açılış saati
  }
  
  // Yarın veya sonraki günlerde ara
  for (let i = 1; i <= 7; i++) {
    const gun = (s.gun + i) % 7;
    const ar = gunAraligi(gun, ayar);
    if (ar) return null; // Sonraki gün bulundu (tarih hesabı gerekir)
  }
  
  return null; // Hiç açılış yok
}

/* Ayar doğrulama */
function ayarDogrula(ayar) {
  if (!ayar || typeof ayar !== 'object') return 'Ayar objesi gerekli';
  
  // Eski şema kontrolü
  if (ayar.hafta_ici) {
    if (typeof ayar.hafta_ici.ac !== 'number' || typeof ayar.hafta_ici.kapa !== 'number') {
      return 'hafta_ici {ac, kapa} sayı olmalı';
    }
    if (ayar.hafta_ici.ac < 0 || ayar.hafta_ici.ac >= 24*60 || 
        ayar.hafta_ici.kapa < 0 || ayar.hafta_ici.kapa > 24*60 ||
        ayar.hafta_ici.ac >= ayar.hafta_ici.kapa) {
      return 'hafta_ici saatler geçersiz';
    }
  }
  
  if (ayar.hafta_sonu) {
    if (typeof ayar.hafta_sonu.ac !== 'number' || typeof ayar.hafta_sonu.kapa !== 'number') {
      return 'hafta_sonu {ac, kapa} sayı olmalı';
    }
    if (ayar.hafta_sonu.ac < 0 || ayar.hafta_sonu.ac >= 24*60 || 
        ayar.hafta_sonu.kapa < 0 || ayar.hafta_sonu.kapa > 24*60 ||
        ayar.hafta_sonu.ac >= ayar.hafta_sonu.kapa) {
      return 'hafta_sonu saatler geçersiz';
    }
  }
  
  // Yeni şema: gunler
  if (ayar.gunler !== undefined) {
    if (!Array.isArray(ayar.gunler) || ayar.gunler.length !== 7) {
      return 'gunler 7 elemanlı dizi olmalı';
    }
    for (let i = 0; i < 7; i++) {
      const g = ayar.gunler[i];
      if (g === null) continue; // Kapalı gün
      if (typeof g !== 'object' || typeof g.ac !== 'number' || typeof g.kapa !== 'number') {
        return `gunler[${i}] null veya {ac,kapa} olmalı`;
      }
      if (g.ac < 0 || g.ac >= 24*60 || g.kapa < 0 || g.kapa > 24*60 || g.ac >= g.kapa) {
        return `gunler[${i}] saatler geçersiz`;
      }
    }
  }
  
  // Geçici kapalılık
  if (ayar.gecici !== undefined && ayar.gecici !== null) {
    const g = ayar.gecici;
    if (typeof g !== 'object') return 'gecici obje olmalı';
    if (!g.baslangic || !g.bitis) return 'gecici {baslangic, bitis} gerekli';
    
    const bas = isoIstanbul(g.baslangic);
    const bit = isoIstanbul(g.bitis);
    if (bas === null || bit === null) return 'gecici tarihler geçersiz (ISO 8601)';
    if (bas >= bit) return 'gecici baslangic < bitis olmalı';
    
    // En çok 2 yıl ileri
    const ikiYil = Date.now() + 2*365*24*60*60*1000;
    if (bit > ikiYil) return 'gecici bitis en çok 2 yıl ileri olabilir';
  }
  
  return null; // Geçerli
}

module.exports = {
  TZ,
  istanbulSimdi,
  gunAraligi,
  durum,
  sonrakiAcilis,
  geciciKapali,
  ayarDogrula,
  isoIstanbul
};
