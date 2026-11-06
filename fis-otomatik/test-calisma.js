/* Çalışma saatleri testleri - Node.js */
const assert = require('assert');
const saat = require('./sunucu/menu/saat.js');

let testSayisi = 0;

function test(ad, fn) {
  fn();
  testSayisi++;
  console.log('✓', ad);
}

// Tarih yardımcıları
function istanbulTarih(yil, ay, gun, saat, dk) {
  // Europe/Istanbul için UTC offset +3 (basitleştirilmiş, DST yok)
  return new Date(Date.UTC(yil, ay - 1, gun, saat - 3, dk || 0));
}

// Test ayarları
const eskiAyar = {
  hafta_ici: {ac: 9*60, kapa: 19*60},
  hafta_sonu: {ac: 10*60, kapa: 18*60},
  kapali_gunler: []
};

const yeniAyar = {
  gunler: [
    {ac: 9*60, kapa: 19*60},   // Pzt
    {ac: 9*60, kapa: 19*60},   // Sal
    {ac: 9*60, kapa: 19*60},   // Çar
    {ac: 9*60, kapa: 19*60},   // Per
    {ac: 9*60, kapa: 19*60},   // Cum
    {ac: 10*60, kapa: 18*60},  // Cmt
    null                       // Paz kapalı
  ]
};

const geciciAyar = {
  hafta_ici: {ac: 9*60, kapa: 19*60},
  hafta_sonu: {ac: 9*60, kapa: 19*60},
  kapali_gunler: [],
  gecici: {
    baslangic: '2026-11-06T00:00:00.000Z',
    bitis: '2026-11-09T09:00:00.000Z',  // 09.11.2026 12:00 Istanbul = 09:00 UTC
    aciklama: 'Tadilat'
  }
};

// ========== İstanbul saat testi ==========
test('Istanbul saat parse', () => {
  const d = istanbulTarih(2026, 11, 6, 12, 30);
  const s = saat.istanbulSimdi(d);
  
  assert.equal(s.tarih, '06.11.2026');
  assert.equal(s.saat, '12:30');
  assert.ok(s.gun >= 0 && s.gun <= 6);
  assert.equal(s.saatDakika, 12*60 + 30);
});

// ========== Eski şema testleri ==========
test('Eski şema: hafta içi gün', () => {
  // Pazartesi 12:00
  const d = istanbulTarih(2026, 11, 9, 12, 0); // 9 Kasım Pazartesi
  const s = saat.istanbulSimdi(d);
  const aralik = saat.gunAraligi(s.gun, eskiAyar);
  
  assert.deepEqual(aralik, {ac: 9*60, kapa: 19*60});
});

test('Eski şema: hafta sonu', () => {
  // Cumartesi 11:00
  const d = istanbulTarih(2026, 11, 7, 11, 0); // 7 Kasım Cumartesi
  const s = saat.istanbulSimdi(d);
  const aralik = saat.gunAraligi(s.gun, eskiAyar);
  
  assert.deepEqual(aralik, {ac: 10*60, kapa: 18*60});
});

test('Eski şema: açık durum', () => {
  const d = istanbulTarih(2026, 11, 9, 12, 0);
  const s = saat.istanbulSimdi(d);
  const durum = saat.durum(eskiAyar, s);
  
  assert.equal(durum.acik, true);
  assert.ok(durum.mesaj.includes('Açığız'));
});

test('Eski şema: kapalı durum (saat dışı)', () => {
  const d = istanbulTarih(2026, 11, 9, 20, 0); // 20:00
  const s = saat.istanbulSimdi(d);
  const durum = saat.durum(eskiAyar, s);
  
  assert.equal(durum.acik, false);
  assert.ok(durum.mesaj.includes('Kapalıyız'));
});

test('Eski şema: kapalı gün', () => {
  const ayar = {...eskiAyar, kapali_gunler: [6]}; // Pazar kapalı
  const d = istanbulTarih(2026, 11, 9, 12, 0);
  const s = saat.istanbulSimdi(d);
  
  // 9 Kasım 2026 Pazartesi (gun=0), test için Pazar'ı simüle et
  const aralik = saat.gunAraligi(6, ayar); // Pazar
  assert.equal(aralik, null);
  
  // Durum testi
  const ayar2 = {...eskiAyar, kapali_gunler: [0]}; // Pazartesi kapalı
  const d2 = saat.durum(ayar2, s);
  assert.equal(d2.acik, false);
  assert.ok(d2.mesaj.includes('Bugün kapalıyız'));
});

// ========== Yeni şema (gunler) testleri ==========
test('Yeni şema: gün gün aralıklar', () => {
  // Pazartesi
  const aralik = saat.gunAraligi(0, yeniAyar);
  assert.deepEqual(aralik, {ac: 9*60, kapa: 19*60});
  
  // Cumartesi
  const aralik2 = saat.gunAraligi(5, yeniAyar);
  assert.deepEqual(aralik2, {ac: 10*60, kapa: 18*60});
  
  // Pazar (kapalı)
  const aralik3 = saat.gunAraligi(6, yeniAyar);
  assert.equal(aralik3, null);
});

test('Yeni şema: Pazar kapalı durumu', () => {
  const d = istanbulTarih(2026, 11, 9, 12, 0);
  let s = saat.istanbulSimdi(d);
  
  // Pazar için manuel gun=6 ayarla
  s.gun = 6;
  const durum = saat.durum(yeniAyar, s);
  
  assert.equal(durum.acik, false);
  assert.ok(durum.mesaj.includes('Bugün kapalıyız'));
});

test('Yeni şema öncelikli (eski ayar olsa bile)', () => {
  const karma = {
    ...eskiAyar,
    gunler: yeniAyar.gunler
  };
  
  // Pazar kontrolü - yeni şema öncelikli
  const aralik = saat.gunAraligi(6, karma);
  assert.equal(aralik, null); // Yeni şemada Pazar kapalı
});

// ========== Geçici kapalılık testleri ==========
test('Geçici kapalılık: aralık içinde kapalı', () => {
  // 07.11.2026 12:00 (geçici kapalılık içinde)
  const d = istanbulTarih(2026, 11, 7, 12, 0);
  const s = saat.istanbulSimdi(d);
  const durum = saat.durum(geciciAyar, s);
  
  assert.equal(durum.acik, false);
  assert.ok(durum.mesaj.includes('kapalıyız'));
  assert.ok(durum.mesaj.includes('09.11.2026'));
  assert.equal(durum.gecici, true);
});

test('Geçici kapalılık: bitiş sonrası açık', () => {
  // 09.11.2026 13:00 (geçici kapalılık bitti)
  const d = istanbulTarih(2026, 11, 9, 13, 0);
  const s = saat.istanbulSimdi(d);
  const durum = saat.durum(geciciAyar, s);
  
  assert.equal(durum.acik, true); // Normal saat açık
  assert.equal(durum.gecici, false);
});

test('Geçici kapalılık: başlangıç öncesi normal çalışma', () => {
  // 05.11.2026 12:00 (geçici kapalılık başlamadan)
  const d = istanbulTarih(2026, 11, 5, 12, 0);
  const s = saat.istanbulSimdi(d);
  const durum = saat.durum(geciciAyar, s);
  
  assert.equal(durum.acik, true); // Normal saat açık
  assert.equal(durum.gecici, false);
});

test('Geçici kapalılık: geciciKapali fonksiyonu', () => {
  const d1 = istanbulTarih(2026, 11, 7, 12, 0);
  const s1 = saat.istanbulSimdi(d1);
  const gec1 = saat.geciciKapali(s1.ms, geciciAyar);
  
  assert.ok(gec1 !== null);
  assert.ok(gec1.mesaj.includes('kapalıyız'));
  
  // Aralık dışı
  const d2 = istanbulTarih(2026, 11, 10, 12, 0);
  const s2 = saat.istanbulSimdi(d2);
  const gec2 = saat.geciciKapali(s2.ms, geciciAyar);
  
  assert.equal(gec2, null);
});

// ========== Ayar doğrulama testleri ==========
test('Doğrulama: geçerli eski şema', () => {
  const hata = saat.ayarDogrula(eskiAyar);
  assert.equal(hata, null);
});

test('Doğrulama: geçerli yeni şema', () => {
  const hata = saat.ayarDogrula(yeniAyar);
  assert.equal(hata, null);
});

test('Doğrulama: geçerli geçici kapalılık', () => {
  const hata = saat.ayarDogrula(geciciAyar);
  assert.equal(hata, null);
});

test('Doğrulama: geçersiz gunler (7 değil)', () => {
  const ayar = {gunler: [{ac: 540, kapa: 1140}]}; // Eksik
  const hata = saat.ayarDogrula(ayar);
  assert.ok(hata.includes('7 elemanlı'));
});

test('Doğrulama: geçersiz saat aralığı', () => {
  const ayar = {
    gunler: [
      {ac: 1140, kapa: 540}, // Ters sıra
      null, null, null, null, null, null
    ]
  };
  const hata = saat.ayarDogrula(ayar);
  assert.ok(hata.includes('geçersiz'));
});

test('Doğrulama: geçersiz geçici tarih', () => {
  const ayar = {
    hafta_ici: {ac: 540, kapa: 1140},
    gecici: {
      baslangic: '2026-11-09T12:00:00Z',
      bitis: '2026-11-06T12:00:00Z' // Ters
    }
  };
  const hata = saat.ayarDogrula(ayar);
  assert.ok(hata.includes('baslangic < bitis'));
});

test('Doğrulama: geçici tarih çok ileri (>2 yıl)', () => {
  const ayar = {
    hafta_ici: {ac: 540, kapa: 1140},
    gecici: {
      baslangic: '2026-11-06T00:00:00Z',
      bitis: '2030-11-06T00:00:00Z' // 4 yıl sonra
    }
  };
  const hata = saat.ayarDogrula(ayar);
  assert.ok(hata.includes('2 yıl'));
});

// ========== Eski ayar dosyasıyla uyumluluk ==========
test('Geriye dönük uyumluluk: gunler yoksa eski şema çalışır', () => {
  const ayar = {
    hafta_ici: {ac: 8*60, kapa: 20*60},
    kapali_gunler: [6]
  };
  
  // Pazartesi
  const aralik = saat.gunAraligi(0, ayar);
  assert.deepEqual(aralik, {ac: 8*60, kapa: 20*60});
  
  // Pazar (kapalı)
  const aralik2 = saat.gunAraligi(6, ayar);
  assert.equal(aralik2, null);
});

test('Geriye dönük uyumluluk: hafta_sonu yoksa hafta_ici kullanılır', () => {
  const ayar = {
    hafta_ici: {ac: 9*60, kapa: 18*60}
  };
  
  // Cumartesi
  const aralik = saat.gunAraligi(5, ayar);
  assert.deepEqual(aralik, {ac: 9*60, kapa: 18*60});
});

// ========== Özel tarih testi (09.11.2026 12:00 TSI) ==========
test('Özel tarih: 09.11.2026 12:00 TSI kapalı, sonrası açık', () => {
  // 09.11.2026 11:59 TSI (hâlâ kapalı)
  const d1 = istanbulTarih(2026, 11, 9, 11, 59);
  const s1 = saat.istanbulSimdi(d1);
  const durum1 = saat.durum(geciciAyar, s1);
  assert.equal(durum1.acik, false);
  
  // 09.11.2026 12:00 TSI (açıldı)
  const d2 = istanbulTarih(2026, 11, 9, 12, 0);
  const s2 = saat.istanbulSimdi(d2);
  const durum2 = saat.durum(geciciAyar, s2);
  assert.equal(durum2.acik, true);
});

console.log(`\n✅ ${testSayisi} test başarıyla geçti`);
