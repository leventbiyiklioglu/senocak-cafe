/* Şenocak Cafe – Sepet → WhatsApp (+ isteğe bağlı fiş aktarım sunucusu).
   Tarayıcıda hiçbir şey kaydedilmez (localStorage/sessionStorage/çerez YOK). Her şey bellekte.
   FIS_SUNUCU_URL doluysa sipariş kopyası arka planda geçici aktarım sunucusuna gider (teslim edilince/en geç 3 saatte silinir). */
(function(root){
'use strict';
var CFG={sifirlaMs:400,
  waNumber:'902128857039',
  FIS_SUNUCU_URL:'https://fis.senocakcafe.com/siparis',
  cafe:{lat:41.03898,lng:28.430606},
  openH:9, closeH:19, tz:'Europe/Istanbul',
  zones:[{max:2,min:300,label:'0–2 km'},{max:5,min:650,label:'2–5 km'},{max:7,min:800,label:'5–7 km'},
         {max:10,min:1200,label:'7–10 km'},{max:20,min:2000,label:'10–20 km'}],
  // Stok 0 (Levent, 21.10): ayranlı ürünler sepete eklenemez. Stok gelince bu listeyi boşaltın.
  unavailable:/ayran/i
};
function parsePrice(t){var m=String(t).replace(/\s|₺/g,'').replace(/\./g,'').replace(',','.');var n=parseFloat(m);return isNaN(n)?null:Math.round(n*100);}
function fmt(k){var tl=k/100;return tl.toLocaleString('tr-TR',{minimumFractionDigits:k%100?2:0,maximumFractionDigits:2})+' ₺';}
function total(items){return items.reduce(function(s,i){return s+i.kurus*i.qty;},0);}
function haversineKm(a,b){var R=6371,r=Math.PI/180,dLa=(b.lat-a.lat)*r,dLo=(b.lng-a.lng)*r;
  var h=Math.sin(dLa/2)*Math.sin(dLa/2)+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLo/2)*Math.sin(dLo/2);
  return 2*R*Math.asin(Math.sqrt(h));}
function zoneFor(km){for(var i=0;i<CFG.zones.length;i++)if(km<=CFG.zones[i].max)return i;return -1;}
function istanbulHour(d){var p=new Intl.DateTimeFormat('en-GB',{timeZone:CFG.tz,hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d);
  var h=+p.find(function(x){return x.type==='hour';}).value%24,m=+p.find(function(x){return x.type==='minute';}).value;return h+m/60;}
function isOpen(d){var h=istanbulHour(d);return h>=CFG.openH&&h<CFG.closeH;}
function normPhone(p){var d=String(p||'').replace(/\D/g,'');if(d.indexOf('90')===0&&d.length===12)d=d.slice(2);if(d.length===10)d='0'+d;
  return /^0[2-5]\d{9}$/.test(d)?d:null;}
function validate(st){ // st:{items,zone,name,phone,address,now}
  var r=[];var t=total(st.items);
  /* 01.11.2026: sunucu durumu (/durum) geldiyse o karar verir; gelmediyse (404/ağ hatası) eski saat kuralı. */
  if(st.durum&&typeof st.durum.acik==='boolean'){if(st.durum.acik===false)r.push(String(st.durum.mesaj||'Şu an kapalıyız.'));}
  else if(!isOpen(st.now))r.push('Kapalıyız, 09:00–19:00');
  var tk=st.tukenen||[];st.items.forEach(function(i){if(tk.indexOf(i.name)>=0)r.push(i.name+' şu an tükendi — sepetten çıkarın');});
  if(!st.items.length)r.push('Sepetiniz boş');
  if(st.zone===-1)r.push('Bu konuma teslimat yok');
  else if(st.zone==null)r.push('Teslimat mesafesini seçin');
  else if(t<CFG.zones[st.zone].min*100)r.push('Minimum sipariş '+fmt(CFG.zones[st.zone].min*100)+' — '+fmt(CFG.zones[st.zone].min*100-t)+' eksik');
  if(!String(st.name||'').trim())r.push('Ad soyad gerekli');
  if(!normPhone(st.phone))r.push('Geçerli bir telefon numarası girin (örn. 0535 123 45 67)');
  if(String(st.address||'').trim().length<10)r.push('Açık adres gerekli');
  /* Bilgilendirme onayı (KVKK m.10) — açık rıza DEĞİL. Yalnız arayüz true/false verir; alan yoksa (eski çağrılar) kontrol edilmez. */
  if(st.aydinlatma===false)r.push('Aydınlatma Metnini okuduğunuzu işaretleyin');
  return r;}
function buildMessage(st){
  var L=['Site siparişi','' ];
  st.items.forEach(function(i){L.push('• '+i.name+' x '+i.qty+' x '+fmt(i.kurus)+' = '+fmt(i.kurus*i.qty));});
  L.push('','Toplam: '+fmt(total(st.items)),'Teslimat: ücretsiz','');
  L.push('Ad: '+st.name.trim(),'Telefon: '+normPhone(st.phone),'Adres: '+st.address.trim());
  if(String(st.note||'').trim())L.push('Not: '+st.note.trim());
  L.push('Ödeme: Kapıda ödeme (nakit/kart)');
  L.push('Teslimat bölgesi: '+(st.zone>=0?CFG.zones[st.zone].label:'-')+(st.km!=null?' (kuş uçuşu ~'+st.km.toFixed(1).replace('.',',')+' km)':' (müşteri seçti)'));
  if(st.shareLoc&&st.loc)L.push('Konum: https://www.google.com/maps/search/?api=1&query='+st.loc.lat.toFixed(6)+','+st.loc.lng.toFixed(6));
  return L.join('\n');}
function waUrl(st){return 'https://wa.me/'+CFG.waNumber+'?text='+encodeURIComponent(buildMessage(st));}
function pad2(n){return (n<10?'0':'')+n;}
function fisVeri(st,tuzak){ // worker.js gecerli() biçimi (FIS_VERI)
  var d=st.now||new Date(),p=new Intl.DateTimeFormat('en-GB',{timeZone:CFG.tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d),g=function(t){return p.find(function(x){return x.type===t;}).value;};
  return {tarih:g('day')+'.'+g('month')+'.'+g('year'),saat:pad2(+g('hour')%24)+':'+g('minute'),ad:String(st.name||'').trim(),tel:normPhone(st.phone)||'',adres:String(st.address||'').trim(),
    kalemler:st.items.map(function(i){return {ad:i.name,adet:i.qty,kurus:i.kurus};}),not:String(st.note||'').trim(),
    bolge:st.zone>=0&&CFG.zones[st.zone]?CFG.zones[st.zone].label:'-',km:st.km!=null?Math.round(st.km*10)/10:null,
    konum:st.shareLoc&&st.loc?{lat:+st.loc.lat.toFixed(6),lng:+st.loc.lng.toFixed(6)}:null,tuzak:tuzak||''};}
function fisGonderilsinMi(url,tuzak){return !!String(url||'').trim()&&!String(tuzak||'').trim();}
/* Sunucuya kopya: hiçbir hata yukarı çıkmaz, hiçbir şey beklenmez. text/plain → CORS ön kontrolü (preflight) yok. */
function fisGonder(st,tuzak,url,tasiyici){
  url=url==null?CFG.FIS_SUNUCU_URL:url;
  if(!fisGonderilsinMi(url,tuzak))return false;
  try{var body=JSON.stringify(fisVeri(st,''));tasiyici=tasiyici||varsayilanTasiyici;var r=tasiyici(url,body);if(r&&typeof r.catch==='function')r.catch(function(){});return true;}catch(e){return false;}}
function varsayilanTasiyici(url,body){
  var n=typeof navigator!=='undefined'?navigator:null;
  if(n&&n.sendBeacon&&typeof Blob!=='undefined'&&n.sendBeacon(url,new Blob([body],{type:'text/plain;charset=UTF-8'})))return;
  if(typeof fetch!=='function')return;
  var ac=typeof AbortController!=='undefined'?new AbortController():null;if(ac)setTimeout(function(){ac.abort();},3000);
  return fetch(url,{method:'POST',body:body,keepalive:true,mode:'cors',credentials:'omit',headers:{'content-type':'text/plain;charset=UTF-8'},signal:ac?ac.signal:undefined});}
/* Gönder tıklaması: önce (senkron) kopyayı tetikle, sonra WhatsApp URL'sini döndür — sunucu ne olursa olsun. */
function gonderTikla(st,tuzak,url,tasiyici){fisGonder(st,tuzak,url,tasiyici);return waUrl(st);}
function tekSeferlik(){var kilitli=false;return {al:function(){if(kilitli)return false;kilitli=true;return true;},birak:function(){kilitli=false;},kilitliMi:function(){return kilitli;}};}
function gonderVeSifirla(st,tuzak,url,tasiyici,sifirla,zamanla){var href=gonderTikla(st,tuzak,url,tasiyici);(zamanla||setTimeout)(sifirla,CFG.sifirlaMs);return href;}
var API={fisVeri:fisVeri,fisGonderilsinMi:fisGonderilsinMi,fisGonder:fisGonder,gonderTikla:gonderTikla,tekSeferlik:tekSeferlik,gonderVeSifirla:gonderVeSifirla,CFG:CFG,parsePrice:parsePrice,fmt:fmt,total:total,haversineKm:haversineKm,zoneFor:zoneFor,isOpen:isOpen,normPhone:normPhone,validate:validate,buildMessage:buildMessage,waUrl:waUrl};
if(typeof module!=='undefined'&&module.exports){module.exports=API;return;}

/* ---------- Arayüz ---------- */
var doc=root.document, cart=[], S={zone:null,km:null,loc:null,durum:null,tukenen:[]};
function $(id){return doc.getElementById(id);}
function find(n){for(var i=0;i<cart.length;i++)if(cart[i].name===n)return cart[i];}
function setQty(name,kurus,q){var it=find(name);if(!it){if(q<=0)return;it={name:name,kurus:kurus,qty:0};cart.push(it);}
  it.qty=Math.max(0,Math.min(50,q));if(!it.qty)cart.splice(cart.indexOf(it),1);render();}
doc.querySelectorAll('.cat li').forEach(function(li){
  var h=li.querySelector('h4'),p=li.querySelector('.price');if(!h||!p)return;
  var name=h.textContent.trim(),k=parsePrice(p.textContent);if(k==null)return;
  var box=doc.createElement('div');box.className='sp-add';box.dataset.name=name;
  if(CFG.unavailable.test(name)){box.innerHTML='<span class="sp-na">Şu an satışta değil</span>';li.appendChild(box);return;}
  box.innerHTML='<button type="button" class="sp-btn sp-addbtn" aria-label="'+name+' sepete ekle">Sepete ekle</button>'+
   '<span class="sp-qty" hidden><button type="button" class="sp-btn sp-m" aria-label="'+name+' bir azalt">−</button><output aria-live="polite">0</output><button type="button" class="sp-btn sp-p" aria-label="'+name+' bir artır">+</button></span>';
  box.querySelector('.sp-addbtn').onclick=function(){setQty(name,k,1);};
  box.querySelector('.sp-m').onclick=function(){var i=find(name);setQty(name,k,(i?i.qty:0)-1);};
  box.querySelector('.sp-p').onclick=function(){var i=find(name);setQty(name,k,(i?i.qty:0)+1);};
  li.appendChild(box);});
var opts=CFG.zones.map(function(z,i){return '<option value="'+i+'">'+z.label+' (min. '+fmt(z.min*100)+')</option>';}).join('')+'<option value="-1">20 km üzeri</option>';
var w=doc.createElement('div');
w.innerHTML='<button type="button" id="spFab" class="sp-fab" aria-controls="spDrawer" aria-expanded="false">🛒 Sepet <span id="spCount">0</span> · <span id="spFabTot">0 ₺</span></button>'+
'<div id="spDrawer" class="sp-drawer" role="dialog" aria-modal="true" aria-labelledby="spTitle" hidden><div class="sp-panel">'+
'<div class="sp-head"><h2 id="spTitle">Sepetim</h2><button type="button" id="spClose" class="sp-btn" aria-label="Sepeti kapat">✕</button></div>'+
'<p id="spHours" class="sp-info"></p><ul id="spList" class="sp-list"></ul>'+
'<p class="sp-tot">Toplam: <strong id="spTot">0 ₺</strong></p><p class="sp-info">✅ Teslimat ücretsiz · ⏱️ Tahmini teslimat 30-50 dk · 💵 Kapıda ödeme (nakit/kart)</p>'+
'<fieldset><legend>Teslimat mesafesi</legend><button type="button" id="spGeo" class="sp-btn sp-wide">📍 Konumumu kullan</button>'+
'<label for="spZone">veya mesafeyi seçin</label><select id="spZone"><option value="">Seçiniz</option>'+opts+'</select>'+
'<p id="spZoneMsg" class="sp-info" aria-live="polite"></p><p class="sp-small">Mesafe kuş uçuşu hesaplanır; sınırda yol mesafesi farklı olabilir, kesin onay siparişte verilir.</p>'+
'<label class="sp-chk" id="spLocWrap" hidden><input type="checkbox" id="spShare"> Konumumu WhatsApp mesajına ekle</label></fieldset>'+
'<fieldset><legend>Bilgileriniz</legend><label for="spName">Ad soyad *</label><input id="spName" autocomplete="name" required>'+
'<label for="spPhone">Telefon *</label><input id="spPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="05xx xxx xx xx" required>'+
'<label for="spAddr">Açık adres *</label><textarea id="spAddr" rows="3" autocomplete="street-address" required></textarea>'+
'<label for="spNote">Not (isteğe bağlı)</label><textarea id="spNote" rows="2" aria-describedby="spNoteUyari"></textarea><p id="spNoteUyari" class="sp-small">⚠️ Lütfen nota sağlık bilgisi (alerji, hastalık vb.) yazmayınız; alerjen sorularınız için bizi telefonla arayın: 0212 885 70 39.</p>'+
'<div class="sp-hp" aria-hidden="true"><label for="spWeb">Web siteniz (boş bırakın)</label><input id="spWeb" name="website" type="text" tabindex="-1" autocomplete="off"></div></fieldset>'+
'<p class="sp-small sp-priv"><b>Bilgilendirme:</b> Ad, telefon, adres ve sipariş bilgileriniz yalnızca siparişinizin hazırlanması ve teslimi için kullanılır: WhatsApp mesajına eklenir ve mutfakta fiş basılabilmesi için geçici bir aktarım sunucusundan geçer (sipariş teslim edilince hemen, en geç 3 saatte silinir). Site tarayıcınızda kayıt tutmaz. Konum eklemek isteğe bağlıdır.</p>'+
'<label class="sp-chk sp-aydin"><input type="checkbox" id="spAydin"> <span><a href="aydinlatma.html" target="_blank" rel="noopener">Aydınlatma Metni</a>&#39;ni okudum ve inceledim. * <small>(rıza beyanı değildir, yalnızca bilgilendirme)</small></span></label>'+
'<p class="note alg-legend sp-small">Alerjenler: G Gluten · S Süt · Y Yumurta · Su Susam · KY Kabuklu yemiş (kaju) · H Hardal · * Şarküteri ürünleri süt, soya, hardal ve sülfit içerebilir. Eser miktarda alerjen bulunabilir.</p>'+
'<ul id="spErr" class="sp-err" aria-live="polite"></ul><div class="sp-sendrow"><a id="spSend" class="btn sp-send" target="_blank" rel="noopener" aria-disabled="true">💬 WhatsApp ile gönder</a></div>'+
'</div></div>';
doc.body.appendChild(w);
var fab=$('spFab'),dr=$('spDrawer');
function openD(o){dr.hidden=!o;fab.setAttribute('aria-expanded',o);if(o)$('spClose').focus();else fab.focus();}
fab.onclick=function(){openD(true);};
doc.querySelectorAll('[data-sepet-ac]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();openD(true);});});
if(root.location&&root.location.hash==='#sepet')openD(true);root.addEventListener('hashchange',function(){if(root.location.hash==='#sepet')openD(true);});$('spClose').onclick=function(){openD(false);};
var gonderKilit=tekSeferlik(),bekleyenSifirla=false;
function sepetiSifirla(){cart.length=0;$('spNote').value='';$('spAydin').checked=false;$('spWeb').value='';bekleyenSifirla=false;gonderKilit.birak();if(!dr.hidden)openD(false);render();}
$('spSend').addEventListener('click',function(e){if(this.getAttribute('aria-disabled')==='true'||!gonderKilit.al()){e.preventDefault();return;}
  bekleyenSifirla=true;try{this.href=gonderVeSifirla(state(),$('spWeb').value,undefined,undefined,sepetiSifirla);}catch(x){root.setTimeout(sepetiSifirla,CFG.sifirlaMs);}});
root.addEventListener('pageshow',function(){if(bekleyenSifirla)sepetiSifirla();});
root.sepetiSifirla=sepetiSifirla;
dr.addEventListener('keydown',function(e){if(e.key==='Escape')openD(false);});
dr.addEventListener('click',function(e){if(e.target===dr)openD(false);});
$('spZone').onchange=function(){S.zone=this.value===''?null:+this.value;S.km=null;S.loc=null;$('spLocWrap').hidden=true;$('spShare').checked=false;render();};
$('spGeo').onclick=function(){var m=$('spZoneMsg');
  if(!navigator.geolocation){m.textContent='Konum kullanılamıyor, lütfen mesafeyi seçin.';return;}
  m.textContent='Konum alınıyor…';
  navigator.geolocation.getCurrentPosition(function(p){S.loc={lat:p.coords.latitude,lng:p.coords.longitude};S.km=haversineKm(CFG.cafe,S.loc);S.zone=zoneFor(S.km);
    $('spZone').value=String(S.zone);$('spLocWrap').hidden=false;render();},
   function(){m.textContent='Konum izni verilmedi, lütfen mesafeyi listeden seçin.';},{enableHighAccuracy:false,timeout:10000,maximumAge:0});};
['spName','spPhone','spAddr','spNote','spShare','spAydin'].forEach(function(id){$(id).addEventListener('input',render);$(id).addEventListener('change',render);});
function state(){return {durum:S.durum,tukenen:S.tukenen,items:cart,zone:S.zone,km:S.km,loc:S.loc,shareLoc:$('spShare').checked,name:$('spName').value,phone:$('spPhone').value,address:$('spAddr').value,note:$('spNote').value,aydinlatma:$('spAydin').checked,now:new Date()};}
function render(){
  var t=total(cart),n=cart.reduce(function(s,i){return s+i.qty;},0);
  $('spCount').textContent=n;$('spFabTot').textContent=fmt(t);$('spTot').textContent=fmt(t);
  doc.querySelectorAll('.sp-add').forEach(function(b){var it=find(b.dataset.name),q=b.querySelector('.sp-qty');if(!q)return;
    q.hidden=!it;b.querySelector('.sp-addbtn').hidden=!!it;b.querySelector('output').textContent=it?it.qty:0;});
  $('spList').innerHTML='';cart.forEach(function(i){var li=doc.createElement('li');li.textContent=i.name+' × '+i.qty+' — '+fmt(i.kurus*i.qty);$('spList').appendChild(li);});
  var st=state();$('spHours').textContent=S.durum?(S.durum.acik?'Açığız — siparişinizi gönderebilirsiniz':(S.durum.mesaj||'Şu an kapalıyız.')):(isOpen(st.now)?'Açığız (09:00–19:00)':'Kapalıyız, 09:00–19:00');
  var zm=$('spZoneMsg');if(S.zone===-1)zm.textContent='Bu konuma teslimat yok'+(S.km!=null?' (~'+S.km.toFixed(1).replace('.',',')+' km)':'');
  else if(S.zone!=null)zm.textContent=(S.km!=null?'Mesafe ~'+S.km.toFixed(1).replace('.',',')+' km · ':'')+'Minimum sipariş '+fmt(CFG.zones[S.zone].min*100);
  var errs=validate(st),a=$('spSend'),e=$('spErr');e.innerHTML='';
  errs.forEach(function(x){var li=doc.createElement('li');li.textContent=x;e.appendChild(li);});
  if(errs.length){a.removeAttribute('href');a.setAttribute('aria-disabled','true');a.classList.add('is-off');}
  else{a.href=waUrl(st);a.setAttribute('aria-disabled','false');a.classList.remove('is-off');}}
setInterval(render,60000);render();
/* 01.11.2026: sunucu durumu (/durum): açık/kapalı + tükenenler, 60 sn'de bir. 404/ağ hatası/zaman aşımı/bozuk yanıt → hiçbir şey değişmez (eski saat kuralı, ürünler görünür). */
function durumUrl(){var u=String(CFG.FIS_SUNUCU_URL||'').trim();return /\/siparis$/.test(u)?u.replace(/\/siparis$/,'/durum'):'';}
var bant=doc.createElement('div');bant.id='spBant';bant.className='sp-bant';bant.setAttribute('role','status');bant.hidden=true;doc.body.insertBefore(bant,doc.body.firstChild);
function urunGizle(){
  doc.querySelectorAll('.cat li').forEach(function(li){var h=li.querySelector('h4');if(!h)return;var g=S.tukenen.indexOf(h.textContent.trim())>=0;li.hidden=g;li.classList.toggle('sp-gizli',g);});
  doc.querySelectorAll('.cat').forEach(function(sec){var bos=!sec.querySelector('li:not([hidden])');sec.hidden=bos;
    if(sec.id)doc.querySelectorAll('#catnav a[href="#'+sec.id+'"]').forEach(function(a){a.hidden=bos;});});}
function durumUygula(){var k=!!(S.durum&&S.durum.acik===false);
  doc.querySelectorAll('.sp-add .sp-addbtn,.sp-add .sp-p').forEach(function(x){x.disabled=k;});
  bant.hidden=!k;bant.textContent=k?'🔒 '+(S.durum.mesaj||'Şu an kapalıyız.')+' Menüyü inceleyebilirsiniz.':'';doc.body.classList.toggle('sp-kapali',k);urunGizle();}
function durumYukle(){var u=durumUrl();if(!u||typeof fetch!=='function')return;
  var ac=typeof AbortController==='function'?new AbortController():null,z=root.setTimeout(function(){if(ac)ac.abort();},5000);
  fetch(u,{credentials:'omit',cache:'no-store',signal:ac?ac.signal:undefined}).then(function(r){return r.ok?r.json():null;}).then(function(j){root.clearTimeout(z);
    if(!j||typeof j.acik!=='boolean')return;
    S.durum={acik:j.acik,mesaj:String(j.mesaj||'')};S.tukenen=Array.isArray(j.kapali_urunler)?j.kapali_urunler.map(String).slice(0,300):[];durumUygula();render();}).catch(function(){root.clearTimeout(z);});}
durumYukle();setInterval(durumYukle,60000);
})(typeof window!=='undefined'?window:this);
