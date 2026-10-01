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
