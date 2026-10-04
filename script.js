(function(){
  document.getElementById('yil').textContent=new Date().getFullYear();
  var links=[].slice.call(document.querySelectorAll('#catnav a'));
  var map={};links.forEach(function(a){map[a.getAttribute('href').slice(1)]=a;});
  if(!('IntersectionObserver' in window))return;
  var io=new IntersectionObserver(function(es){
    es.forEach(function(e){
      if(e.isIntersecting){
        links.forEach(function(l){l.classList.remove('active');});
        var a=map[e.target.id];a.classList.add('active');
        var n=document.getElementById('catnav');
        n.scrollTo({left:a.offsetLeft-n.clientWidth/2+a.clientWidth/2,behavior:'smooth'});
      }
    });
  },{rootMargin:'-130px 0px -70% 0px'});
  document.querySelectorAll('.cat').forEach(function(s){io.observe(s);});
})();

(function(){
  var btn=document.getElementById('shareBtn'),msg=document.getElementById('shareMsg');
  if(!btn)return;
  var url='https://senocakcafe.com/';
  var data={title:'Şenocak Cafe',text:'Şenocak Cafe - menü ve bilgiler',url:url};
  var t;
  function say(m){msg.textContent=m;clearTimeout(t);t=setTimeout(function(){msg.textContent='';},3000);}
  function fallback(){
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(url).then(function(){say('Bağlantı kopyalandı ✓');},legacy);
    }else legacy();
  }
  function legacy(){
    var ta=document.createElement('textarea');ta.value=url;ta.setAttribute('readonly','');
    ta.style.cssText='position:fixed;opacity:0;top:0;left:0';document.body.appendChild(ta);ta.select();
    var ok=false;try{ok=document.execCommand('copy');}catch(e){}
    document.body.removeChild(ta);
    say(ok?'Bağlantı kopyalandı ✓':'Kopyalanamadı, adresi elle kopyalayın: '+url);
  }
  btn.addEventListener('click',function(){
    if(navigator.share){
      navigator.share(data).catch(function(e){if(e&&e.name!=='AbortError')fallback();});
    }else fallback();
  });
})();
