/* Çalışma Saatleri Panel - Client-side Logic */
(function() {
'use strict';

const GUN_ADLARI = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
let mevcutAyar = null;
let pinDogrulandi = false;

// PIN koruma kontrolü (sessionStorage, sadakat.html örneği)
function pinKontrol() {
  const pin = sessionStorage.getItem('panel_pin');
  if (pin === 'dogrulandi') {
    pinDogrulandi = true;
    return true;
  }
  
  // PIN iste
  const girdi = prompt('Panel PIN kodunu girin:');
  if (girdi === '7039') { // Örnek PIN (gerçekte sunucu tarafında kontrol edilmeli)
    sessionStorage.setItem('panel_pin', 'dogrulandi');
    pinDogrulandi = true;
    return true;
  }
  
  alert('Hatalı PIN. Giriş reddedildi.');
  window.location.href = 'index.html';
  return false;
}

// Dakikayı HH:MM formatına çevir
function dakikaStr(dk) {
  const h = Math.floor(dk / 60);
  const m = dk % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// HH:MM'yi dakikaya çevir
function strDakika(str) {
  const parts = str.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

// ISO tarih → dd.mm.yyyy HH:MM (Istanbul için lokalleştirilmiş görüntüleme)
function isoGoster(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// datetime-local input → ISO 8601 (lokal saat, Z eklemeden)
function inputIso(val) {
  if (!val) return null;
  // val format: 2026-11-06T00:00
  return new Date(val).toISOString();
}

// ISO → datetime-local input formatı
function isoInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Ayarı yükle
async function ayarYukle() {
  try {
    const res = await fetch('/panel/calisma', {
      credentials: 'include'
    });
    
    if (!res.ok) {
      throw new Error('Ayar yüklenemedi: ' + res.status);
    }
    
    const data = await res.json();
    mevcutAyar = data.ayar || {};
    return mevcutAyar;
  } catch (e) {
    throw new Error('Ağ hatası: ' + e.message);
  }
}

// Durumu yükle (sepet /durum endpoint'i)
async function durumYukle() {
  try {
    const res = await fetch('/durum');
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

// Ayarı kaydet
async function ayarKaydet(ayar) {
  try {
    const res = await fetch('/panel/calisma', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      credentials: 'include',
      body: JSON.stringify(ayar)
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.hata || 'Kayıt başarısız');
    }
    
    return await res.json();
  } catch (e) {
    throw new Error('Kayıt hatası: ' + e.message);
  }
}

// UI güncellemeleri
function goster(id) {
  document.getElementById(id).classList.remove('p-hidden');
}

function gizle(id) {
  document.getElementById(id).classList.add('p-hidden');
}

function hataGoster(mesaj) {
  const el = document.getElementById('pHata');
  el.textContent = mesaj;
  goster('pHata');
  setTimeout(() => gizle('pHata'), 5000);
}

function basariGoster(mesaj) {
  const el = document.getElementById('pBasari');
  el.textContent = mesaj;
  goster('pBasari');
  setTimeout(() => gizle('pBasari'), 3000);
}

// Durumu göster
async function durumGuncelle() {
  const durum = await durumYukle();
  const el = document.getElementById('pDurum');
  
  if (!durum) {
    el.innerHTML = '<span class="p-status p-status-closed">Durum alınamadı</span>';
    return;
  }
  
  const status = durum.acik ? 'p-status-open' : 'p-status-closed';
  const text = durum.acik ? '✅ Açık' : '🔒 Kapalı';
  el.innerHTML = `<span class="p-status ${status}">${text}</span> <span style="margin-left: 12px;">${durum.mesaj || ''}</span>`;
}

// Geçici kapalılık UI
function geciciGuncelle() {
  const gecici = mevcutAyar.gecici;
  
  if (gecici && gecici.baslangic && gecici.bitis) {
    document.getElementById('pGeciciBasStr').textContent = isoGoster(gecici.baslangic);
    document.getElementById('pGeciciBitStr').textContent = isoGoster(gecici.bitis);
    document.getElementById('pGeciciAck').textContent = gecici.aciklama || '(açıklama yok)';
    goster('pGeciciVar');
    gizle('pGeciciYok');
  } else {
    goster('pGeciciYok');
    gizle('pGeciciVar');
  }
  
  gizle('pGeciciForm');
}

// Geçici kapalılık formu aç
function geciciFormAc(duzenle = false) {
  const gecici = mevcutAyar.gecici || {};
  
  if (duzenle && gecici.baslangic) {
    document.getElementById('pGeciciBas').value = isoInput(gecici.baslangic);
    document.getElementById('pGeciciBit').value = isoInput(gecici.bitis);
    document.getElementById('pGeciciAciklama').value = gecici.aciklama || '';
  } else {
    // Yeni ekleme: varsayılan olarak şimdi başlat
    const now = new Date();
    const ileri = new Date(now.getTime() + 3*24*60*60*1000); // 3 gün sonra
    document.getElementById('pGeciciBas').value = isoInput(now.toISOString());
    document.getElementById('pGeciciBit').value = isoInput(ileri.toISOString());
    document.getElementById('pGeciciAciklama').value = '';
  }
  
  goster('pGeciciForm');
  gizle('pGeciciVar');
  gizle('pGeciciYok');
}

// Geçici kapalılık kaydet
async function geciciKaydet() {
  const bas = document.getElementById('pGeciciBas').value;
  const bit = document.getElementById('pGeciciBit').value;
  const ack = document.getElementById('pGeciciAciklama').value.trim();
  
  if (!bas || !bit) {
    hataGoster('Başlangıç ve bitiş tarihleri gerekli');
    return;
  }
  
  const basIso = inputIso(bas);
  const bitIso = inputIso(bit);
  
  if (new Date(basIso) >= new Date(bitIso)) {
    hataGoster('Başlangıç tarihi bitiş tarihinden önce olmalı');
    return;
  }
  
  mevcutAyar.gecici = {
    baslangic: basIso,
    bitis: bitIso,
    aciklama: ack
  };
  
  try {
    await ayarKaydet(mevcutAyar);
    basariGoster('Geçici kapalılık kaydedildi');
    geciciGuncelle();
    durumGuncelle();
    hamVeriGuncelle();
  } catch (e) {
    hataGoster(e.message);
  }
}

// Geçici kapalılık kaldır
async function geciciKaldir() {
  if (!confirm('Geçici kapalılığı kaldırmak istediğinize emin misiniz?')) return;
  
  mevcutAyar.gecici = null;
  
  try {
    await ayarKaydet(mevcutAyar);
    basariGoster('Geçici kapalılık kaldırıldı');
    geciciGuncelle();
    durumGuncelle();
    hamVeriGuncelle();
  } catch (e) {
    hataGoster(e.message);
  }
}

// Günlük çalışma saatleri UI
function gunleriRender() {
  const container = document.getElementById('pGunler');
  container.innerHTML = '';
  
  // Mevcut ayardan gunler veya eski şemadan default
  let gunler = mevcutAyar.gunler;
  
  if (!gunler || !Array.isArray(gunler) || gunler.length !== 7) {
    // Eski şemadan dönüştür
    const haftaici = mevcutAyar.hafta_ici || {ac: 9*60, kapa: 19*60};
    const haftasonu = mevcutAyar.hafta_sonu || haftaici;
    const kapali = mevcutAyar.kapali_gunler || [];
    
    gunler = [];
    for (let i = 0; i < 7; i++) {
      if (kapali.includes(i)) {
        gunler.push(null);
      } else {
        const aralik = (i >= 5) ? haftasonu : haftaici;
        gunler.push({ac: aralik.ac, kapa: aralik.kapa});
      }
    }
  }
  
  GUN_ADLARI.forEach((ad, i) => {
    const gun = gunler[i];
    const kapali = gun === null;
    
    const card = document.createElement('div');
    card.className = 'p-day-card';
    card.innerHTML = `
      <h3>${ad}</h3>
      <div class="p-checkbox">
        <input type="checkbox" id="pGunKapali${i}" ${kapali ? 'checked' : ''}>
        <label for="pGunKapali${i}">Bu gün kapalı</label>
      </div>
      <div id="pGunSaat${i}" class="p-time-row" ${kapali ? 'style="display:none"' : ''}>
        <input type="time" class="p-time-input" id="pGunAc${i}" value="${kapali ? '09:00' : dakikaStr(gun.ac)}">
        <span>—</span>
        <input type="time" class="p-time-input" id="pGunKapa${i}" value="${kapali ? '19:00' : dakikaStr(gun.kapa)}">
      </div>
    `;
    
    container.appendChild(card);
    
    // Kapalı checkbox toggle
    const checkbox = document.getElementById(`pGunKapali${i}`);
    const saatRow = document.getElementById(`pGunSaat${i}`);
    checkbox.addEventListener('change', () => {
      saatRow.style.display = checkbox.checked ? 'none' : 'flex';
    });
  });
}

// Günleri kaydet
async function gunleriKaydet() {
  const gunler = [];
  
  for (let i = 0; i < 7; i++) {
    const kapali = document.getElementById(`pGunKapali${i}`).checked;
    if (kapali) {
      gunler.push(null);
    } else {
      const acStr = document.getElementById(`pGunAc${i}`).value;
      const kapaStr = document.getElementById(`pGunKapa${i}`).value;
      const ac = strDakika(acStr);
      const kapa = strDakika(kapaStr);
      
      if (ac >= kapa) {
        hataGoster(`${GUN_ADLARI[i]}: Açılış saati kapanıştan önce olmalı`);
        return;
      }
      
      gunler.push({ac, kapa});
    }
  }
  
  mevcutAyar.gunler = gunler;
  
  try {
    await ayarKaydet(mevcutAyar);
    basariGoster('Çalışma saatleri kaydedildi');
    durumGuncelle();
    hamVeriGuncelle();
  } catch (e) {
    hataGoster(e.message);
  }
}

// Günleri sıfırla (9:00-19:00)
function gunleriSifirla() {
  if (!confirm('Tüm günler için çalışma saatlerini 9:00-19:00 yapmak istediğinize emin misiniz?')) return;
  
  const gunler = [];
  for (let i = 0; i < 7; i++) {
    gunler.push({ac: 9*60, kapa: 19*60});
  }
  
  mevcutAyar.gunler = gunler;
  gunleriRender();
}

// Ham veri göster
function hamVeriGuncelle() {
  document.getElementById('pHamVeri').textContent = JSON.stringify(mevcutAyar, null, 2);
}

// Event listeners
document.getElementById('pGeciciEkle').addEventListener('click', () => geciciFormAc(false));
document.getElementById('pGeciciDuzenle').addEventListener('click', () => geciciFormAc(true));
document.getElementById('pGeciciKaydet').addEventListener('click', geciciKaydet);
document.getElementById('pGeciciIptal').addEventListener('click', geciciGuncelle);
document.getElementById('pGeciciKaldir').addEventListener('click', geciciKaldir);
document.getElementById('pGunleriKaydet').addEventListener('click', gunleriKaydet);
document.getElementById('pGunleriSifirla').addEventListener('click', gunleriSifirla);

// Sayfa yüklendiğinde
async function init() {
  // PIN kontrolü
  if (!pinKontrol()) return;
  
  try {
    await ayarYukle();
    
    gizle('pYukleniyor');
    goster('pIcerik');
    
    durumGuncelle();
    geciciGuncelle();
    gunleriRender();
    hamVeriGuncelle();
    
    // Durum 60 saniyede bir güncelle
    setInterval(durumGuncelle, 60000);
  } catch (e) {
    gizle('pYukleniyor');
    hataGoster(e.message);
  }
}

// Sayfa hazır olduğunda başlat
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
