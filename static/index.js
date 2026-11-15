const $=s=>document.querySelector(s);let R,R0,QU="",RD,RID=0,P=[],NF=[],ST,M={},EL={};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const LONG=['/api/extract','/api/products','/api/substitute'];
const api=async(p,b)=>{let w;if(b!==undefined&&LONG.includes(p)){const base=$('#msg').textContent;let v=0;
  try{v=(await (await fetch('/api/log?since=999999999')).json()).v||0}catch(e){}
  w=setInterval(async()=>{try{const r=await (await fetch('/api/log?since='+v)).json();const m=(r.events||[]).filter(e=>e.kind=='model'&&e.state=='run').pop();
   if(m)$('#msg').textContent=base+' – '+m.step+': '+m.detail}catch(e){}},2000)}
 try{return await (await fetch(p,b===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)})).json()}finally{clearInterval(w)}};
const msg=(t,w)=>{$('#msg').textContent=t||'';$('#msg').className=w?'warn':''};
const save=o=>api('/api/settings',o),s2=()=>$('#s2').checked,lock=b=>document.querySelectorAll('button').forEach(x=>x.disabled=b);
const mtxt=()=>M.markt?M.markt+(M.ort?', '+M.ort:''):'';
const det=k=>esc([k.marke,k.packung].filter(Boolean).join(' · '))+(k.kategorien?(k.marke||k.packung?'<br>':'')+esc(k.kategorien):'');
const img=(k,c='')=>k&&k.image?`<img ${c} src="${esc(k.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'';
function showM(){$('#mk-cur').innerHTML=M.markt?`<b>${esc(M.markt)}</b>${M.ort?'<br>'+esc(M.ort):''}${M.markt_url?` · <a href="${esc(M.markt_url)}" target="_blank" rel="noopener">Marktseite</a>`:''}`:'<span class="s-wa">Noch kein Markt gewählt.</span>'}
async function init(){ST=await api('/api/status');const s=ST.settings;
 M={markt:s.markt,ort:s.ort,markt_id:s.markt_id,markt_url:s.markt_url};showM();
 $('#modell').innerHTML=ST.modelle.map(m=>`<option ${m===s.modell?'selected':''}>${esc(m)}</option>`).join('');
 if(!ST.ollama)msg('Das lokale Modell antwortet nicht. Läuft Ollama? Danach Seite neu laden.',1);
 else if(!ST.modelle.length)msg('Kein Modell installiert. Mit „ollama pull <Modellname>“ ein Modell laden.',1);
 else if(!ST.modelle.includes(s.modell))save({modell:ST.modelle[0]});
 $('#s2').checked=s.stufe2&&ST.key;$('#s2').disabled=!ST.key;
 $('#cr').textContent=ST.key?`API.SH-Credits diesen Monat: ${ST.credits} von ${s.limit}`:'Marktsuche und Stufe 2 brauchen einen API.SH-Schlüssel in der Datei .env (siehe README).';
 $('#mk-find').hidden=!ST.key;$('#mk-man').hidden=!!ST.key;$('#mk-man').value=s.markt;
 $('#modell').onchange=e=>save({modell:e.target.value});$('#ton').checked=s.ton!==false;
 $('#ton').onchange=e=>{save({ton:e.target.checked});if(e.target.checked){tonBereit();ton(false)}};$('#s2').onchange=e=>save({stufe2:e.target.checked});
 $('#mk-man').onchange=e=>{M={markt:e.target.value.trim(),ort:'',markt_id:'',markt_url:''};save(M);showM()};
 $('#plz').onkeydown=e=>{if(e.key=='Enter')$('#mk-go').click()};
 $('#mk-go').onclick=async()=>{const q=$('#plz').value.trim();if(!q)return msg('Bitte Postleitzahl oder Ort eingeben.',1);
  lock(1);msg('Märkte werden gesucht …');const r=await api('/api/markets',{q});lock(0);if(r.fehler)return msg(r.fehler,1);
  msg(r.length?'':'Keine Märkte gefunden. Bitte eine andere Postleitzahl oder einen anderen Ort versuchen.',!r.length);
  $('#mk-list').innerHTML=r.map((m,i)=>`<label class="mk"><input type="radio" name="mk" value="${i}"><span><b>${esc(m.name)}</b> – ${esc(m.street)}, ${esc(m.postcode)} ${esc(m.city)}<br><small>${m.pickup?'Abholservice · ':''}${esc(m.open_status||'')}</small></span></label>`).join('');
  $('#mk-list').onchange=e=>{const m=r[+e.target.value];M={markt:`${m.name}, ${m.street}`,ort:`${m.postcode} ${m.city}`,markt_id:m.id,markt_url:m.url};
   save(M);showM();$('#mk-list').innerHTML='';msg('Markt gespeichert.')}}}
init();
const cands=(i,c,w)=>`<details><summary>Anderes Produkt wählen (${c.length} Treffer)</summary>${c.map((k,j)=>`<label class="cand"><input type="radio" name="w${i}" data-i="${i}" data-f="w" value="${j}" ${j===w?'checked':''}>${img(k)}<span>${esc(k.name)}</span></label>`).join('')}<label class="cand"><input type="radio" name="w${i}" data-i="${i}" data-f="w" value="-1" ${w<0?'checked':''}><span>Keines passt</span></label></details>`;
function draw(){const st=s2();
 $('#zt').innerHTML=R.zutaten.map((z,i)=>{const p=P[i]||{},c=p.kandidaten||[],w=p.wahl;let r;
  if(!st)r='<small>Stufe 2 ist aus – kein Produktvorschlag.</small>';
  else if(p.uebersprungen)r=p.standard?`<div class="prod">${img(p.standard)}<div><b>${esc(p.standard.name)}</b><br><small>Standardzutat – wird nicht gesucht.</small></div></div>`:'<small>Grundzutat – wird nicht gesucht.</small>';
  else if(!p.kandidaten)r='<small>Noch nicht gesucht.</small>';
  else if(w>=0)r=`<div class="prod">${img(c[w])}<div><b>${esc(c[w].name)}</b><br>${det(c[w])?`<small>${det(c[w])}</small><br>`:''}<a href="${esc(c[w].url)}" target="_blank" rel="noopener">Im REWE-Shop ansehen</a> ${p.erinnerung?'<span class="badge mem">aus Erinnerung</span> ':''}<small class="lb" style="display:inline">· ${esc(p.quelle||'')}</small></div></div>${cands(i,c,w)}`;
  else r=`<span class="badge">${c.length?'Kein Treffer passt':'Keine Treffer'} – für diese Zutat wird ein Ersatz vorgeschlagen.</span>${c.length?cands(i,c,w):''}`;
  return `<div class="zr"><div><label class="lb">Zutat (Original)<textarea data-i="${i}" data-f="t" rows="2">${esc(z.text)}</textarea></label>
   <label class="nf"><input type="checkbox" data-i="${i}" data-f="n" ${NF[i]?'checked':''}> Im Markt nicht gefunden – Ersatz vorschlagen</label></div>
   <div><span class="lb">Produkt im REWE-Online-Sortiment</span>${r}</div></div>`}).join('');
 fit()}
const fit=()=>document.querySelectorAll('#zt textarea').forEach(t=>{t.style.height='auto';t.style.height=t.scrollHeight+'px'});
$('#zt').oninput=$('#zt').onchange=async e=>{const i=+e.target.dataset.i,f=e.target.dataset.f;if(isNaN(i))return;
 if(f=='t'){R.zutaten[i].text=e.target.value;fit()}if(f=='n')NF[i]=e.target.checked;
 if(f=='w'&&e.type=='change'){P[i].wahl=+e.target.value;NF[i]=P[i].wahl<0;P[i].quelle='deine Auswahl (wird gemerkt)';P[i].erinnerung=false;draw();const k=P[i].kandidaten[P[i].wahl];
  if(k)api('/api/merken',{zutat:R.zutaten[i].name,produkt:{id:k.id,name:k.name,url:k.url,image:k.image}});
  if(k&&!k.marke&&!k.packung&&ST.settings.details_auto!==false){const r=await api('/api/details',{id:k.id});if(!r.fehler){Object.assign(k,r);draw()}}}};
$('#ul').onclick=async()=>{lock(1);msg('Rezeptseite wird geladen …');const r=await api('/api/url',{url:$('#url').value.trim()});lock(0);
 if(r.fehler)return msg(r.fehler,1);$('#txt').value=QU=r.text;msg(r.warnung||'Rezept geladen. Bitte kurz prüfen und „Rezept verarbeiten“ klicken.',!!r.warnung)};
$('#go').onclick=async()=>{if(!M.markt)return msg('Bitte zuerst einen REWE-Markt wählen.',1);lock(1);msg('Rezept wird extrahiert … (bei lokalen Modellen kann das etwas dauern)');
 erlaubnis();await ladeS();eta(S.extrahieren+(s2()?S.zutaten_schnitt*S.zutat:0),'Rezept wird übersetzt',['extrahieren'].concat(s2()?['zutat']:[]),'Rezept wird extrahiert');
 const r=await api('/api/extract',{text:$('#txt').value,quelle:QU&&$('#txt').value===QU?'hellofresh':'text'});if(r.fehler){lock(0);eta(null);fertig('Rezept konnte nicht verarbeitet werden',r.fehler,1,'#txt');return msg(r.fehler,1)}
 R=r;RID=0;R0={z:r.zutaten.length,s:r.schritte.length};P=r.zutaten.map(()=>({}));NF=[];
 $('#schr').value=r.schritte.join('\n');$('#prep').hidden=false;$('#res').hidden=true;draw();let w=[...r.warnungen];eta(s2()?R.zutaten.length*S.zutat:null,0,0,`Produktsuche 0 von ${R.zutaten.length}`);
 if(s2()){for(let i=0;i<R.zutaten.length;i++){msg(`Produktsuche ${i+1} von ${R.zutaten.length} …`);
  const p=await api('/api/products',{name:R.zutaten[i].name,lauf:R.lauf});if(p.fehler){w.push(p.fehler);break}
  P[i]=p;if(!p.uebersprungen&&p.wahl<0)NF[i]=true;draw();eta((R.zutaten.length-i-1)*S.zutat,0,0,`Produktsuche ${i+1} von ${R.zutaten.length}`)}}
 lock(0);eta(null);msg(w.join(' · '),w.length);
 const zu=P.filter(p=>p.wahl>=0||p.uebersprungen).length,nf=R.zutaten.filter((_,i)=>NF[i]).length;
 fertig('Rezept übersetzt',(s2()?`${R.zutaten.length} Zutaten: ${zu} zugeordnet, ${nf} für Ersatz markiert.`:`${R.zutaten.length} Zutaten und ${R.schritte.length} Schritte erkannt.`)+
  (w.length?` ${w.length} Hinweis(e) beachten.`:' Bitte prüfen und „Rezept erstellen“ klicken.'),w.length,'#prep')};
$('#mk').onclick=async()=>{R.schritte=$('#schr').value.split('\n').map(s=>s.trim()).filter(Boolean);
 const idx=R.zutaten.map((_,i)=>NF[i]?i:-1).filter(i=>i>=0),E={},used=[];lock(1);let w=[],bad=0;
 erlaubnis();if(idx.length){await ladeS();eta(idx.length*proErsatz(),'Ersatz wird vorgeschlagen',['ersatz'],`Ersatz 0 von ${idx.length}`)}
 for(const[k,i]of idx.entries()){msg(`Ersatz für Zutat ${k+1} von ${idx.length} …`);
  const e=await api('/api/substitute',{rezept:R,index:i,bisher:used,lauf:R.lauf});
  if(e.fehler){E[i]={ok:false,grund:e.fehler};w.push(e.fehler);if(++bad>=2)break}else{bad=0;E[i]=e;if(e.ok)used.push(e.ersatz)}eta((idx.length-k-1)*proErsatz(),0,0,`Ersatz ${k+1} von ${idx.length}`)}
 idx.forEach(i=>{if(!E[i])E[i]={ok:false,grund:'Nicht versucht, weil davor mehrere Anfragen fehlgeschlagen sind.'}});
 EL=E;lock(0);eta(null);msg(w.join(' · '),w.length);render(E);const gut=idx.filter(i=>E[i]&&E[i].ok).length;
 fertig('Rezept erstellt',idx.length?`${gut} von ${idx.length} Ersatzvorschlägen gefunden.`+(gut<idx.length?' Offene Punkte stehen im Rezept.':''):'Alle Zutaten sind zugeordnet, kein Ersatz nötig.',gut<idx.length,'#res')};
$('#res').onclick=async ev=>{if(ev.target.id=='sv')return saveRez(ev.target);const b=ev.target.closest('.retry');if(!b)return;const i=+b.dataset.i;lock(1);erlaubnis();msg('Ersatz wird erneut angefragt …');await ladeS();eta(proErsatz(),'Ersatz wird vorgeschlagen',['ersatz'],'Ersatz 0 von 1');
 const used=Object.values(EL).filter(x=>x&&x.ok).map(x=>x.ersatz),r=await api('/api/substitute',{rezept:R,index:i,bisher:used,lauf:R.lauf});
 lock(0);eta(null);fertig(r.fehler||!r.ok?'Kein Ersatz gefunden':'Ersatz gefunden',r.fehler||(r.ok?`${R.zutaten[i].name} → ${r.ersatz}`:r.grund||''),r.fehler||!r.ok,'#res');EL[i]=r.fehler?{ok:false,grund:r.fehler}:r;msg(r.fehler||'',!!r.fehler);render(EL,true)};
const norm=s=>String(s||'').toLowerCase().replace(/\s+/g,' ').trim();
const amount=z=>{const m=((z.menge||'')+' '+(z.einheit||'')).trim();if(m)return m;
 const t=String(z.text||'').match(/^\s*(\d[\d.,/–-]*\s*(?:[A-Za-zäöüÄÖÜ.]{1,12})?)\s/);return t?t[1].trim():''};
const orig=z=>norm(z.text)!=norm(z.name)?`<small>Original: ${esc(z.text)}</small>`:'';
function render(E,noscroll){const ZD=[],HR={},st=s2(),stand=(P.find(p=>p.stand)||{}).stand||new Date().toISOString().slice(0,10),hints={},open=[];
 const items=R.zutaten.map((z,i)=>{const p=P[i]||{},e=E[i];let tag,cls,main=esc(z.name),sub='',im='',am=amount(z),nm=z.name,pr=null;
  if(NF[i]&&e&&e.ok){tag='Ersatz'+(e.unsicher?' – unsicher':'');cls='wa';am=e.menge||am;nm=e.ersatz;main=esc(nm);
   const pk=e.produkt&&e.produkt.wahl>=0?e.produkt.kandidaten[e.produkt.wahl]:null;im=img(pk,'class="rimg"');pr=pk;
   sub=`${e.mischung?`<div class="mix"><b>Mischung:</b> ${esc(e.mischung)}</div>`:''}`+
    (pk?`<div><a href="${esc(pk.url)}">${esc(pk.name)}</a>${det(pk)?'<br><small>'+det(pk)+'</small>':''}</div>`:e.produkt?'<small>Kein passendes Produkt im Online-Sortiment gefunden.</small><br>':'')+
    (e.mix_produkte&&e.mix_produkte.length?`<div class="mix"><b>Im Online-Sortiment:</b><br>${e.mix_produkte.map(m=>m.produkt?`${esc(m.name)}: <a href="${esc(m.produkt.url)}">${esc(m.produkt.name)}</a>`:m.standard?`${esc(m.name)}: Standardzutat`:`${esc(m.name)}: kein Produkt gefunden`).join('<br>')}</div>`:'')+
    `<small>${esc(e.begruendung)}<br>statt: ${esc(z.text)}</small>`;
   e.schritte.forEach(x=>{(hints[x.nr]=hints[x.nr]||[]).push(`${esc(e.ersatz)}: ${esc(x.hinweis)}`);(HR[x.nr]=HR[x.nr]||[]).push(`${e.ersatz}: ${x.hinweis}`)})}
  else if(NF[i]){tag='Im Markt prüfen';cls='wa';sub=`<small class="s-wa">Kein Ersatz: ${esc((e&&e.grund)||'keine Antwort')}</small> <button class="retry noprint" data-i="${i}">Erneut versuchen</button><br>`+orig(z);open.push(z.text)}
  else if(p.standard){tag='Standardzutat';cls='mu';nm=p.standard.name;main=esc(nm);im=img(p.standard,'class="rimg"');sub=orig(z)}
  else if(st&&p.wahl>=0){const k=p.kandidaten[p.wahl];pr=k;tag='Produkt zugeordnet';cls='ok';im=img(k,'class="rimg"');
   sub=`<a href="${esc(k.url)}">${esc(k.name)}</a>${det(k)?'<br><small>'+det(k)+'</small>':''}${orig(z)?'<br>'+orig(z):''}`}
  else if(st&&p.kandidaten&&!p.uebersprungen){tag='Im Markt prüfen';cls='wa';sub=orig(z);open.push(z.text)}
  else{tag='Übernommen';cls='mu';sub=orig(z)}
  const ok=NF[i]&&e&&e.ok;ZD.push({menge:am,name:nm,original:z.text,status:tag,mischung:ok?e.mischung||'':'',begruendung:ok?e.begruendung||'':'',
   produkt:pr?{name:pr.name,url:pr.url,image:pr.image,marke:pr.marke||'',packung:pr.packung||''}:null});
  return `<li><div class="mg">${am?esc(am):'<span class="mu" title="Keine Mengenangabe im Rezepttext">–</span>'}</div><div class="nm"><b>${main}</b><span class="tag ${cls}">${tag}</span>${sub?'<br>'+sub:''}</div>${im}</li>`}).join('');
 const warn=(R.zutaten.length!=R0.z||R.schritte.length!=R0.s)?`<p class="s-wa">Warnung: Anzahl Zutaten/Schritte weicht von der Extraktion ab (${R0.z}/${R0.s}).</p>`:'';
 const noamt=R.zutaten.every(z=>!amount(z))?'<p class="s-wa">Im Rezepttext wurden keine Mengenangaben erkannt. Bitte die Zutatenliste mit Mengen einfügen und das Rezept erneut verarbeiten.</p>':'';
 $('#res').innerHTML=`<article class="rez"><h2>${esc(R.rezeptname)}</h2>
 <p class="meta">${R.portionen?esc(R.portionen)+' Portionen · ':''}${esc(mtxt()||'Markt nicht angegeben')} · ${new Date().toLocaleDateString('de-DE')}</p>${warn}${noamt}
 <div class="rg"><section><h3>Zutaten</h3><ul class="zl">${items}</ul></section>
 <section><h3>Zubereitung</h3><ol class="st">${R.schritte.map((t,i)=>`<li>${esc(t)}${(hints[i+1]||[]).map(h=>`<div class="hint">Hinweis zum Ersatz – ${h}</div>`).join('')}</li>`).join('')}</ol></section></div>
 ${open.length?`<div class="open"><b>Offene Punkte – im Markt prüfen</b><ul>${open.map(o=>`<li>${esc(o)}</li>`).join('')}</ul></div>`:''}
 <p class="fest">${st?`Produktzuordnung aus dem REWE-Online-Sortiment (Stand: ${stand}). Filialbestand nicht geprüft.`:'Nicht gegen den Bestand des Marktes geprüft.'}</p></article>
 <p class="noprint"><button onclick="print()">Drucken / als PDF speichern</button> <button id="sv">${RID?'Gespeicherte Fassung aktualisieren':'In Rezeptdatenbank speichern'}</button></p>`;
 RD={name:R.rezeptname,portionen:R.portionen||'',markt:mtxt(),stand:st?stand:'',zutaten:ZD,offen:open,
  schritte:R.schritte.map((t,i)=>({text:t,hinweise:HR[i+1]||[]}))};
 $('#res').hidden=false;if(!noscroll)$('#res').scrollIntoView()}
async function saveRez(b){const h=$('#res .rez').cloneNode(true);h.querySelectorAll('.noprint').forEach(x=>x.remove());lock(1);msg('Rezept wird gespeichert …');
 const r=await api('/api/rezept_speichern',{daten:RD,html:h.outerHTML,id:RID||null,lauf:R.lauf||null});lock(0);if(r.fehler)return msg(r.fehler,1);
 const neu=!RID;RID=r.id;b.textContent='Gespeicherte Fassung aktualisieren';
 msg(neu?`Rezept als Nr. ${r.id} in der Rezeptdatenbank gespeichert.`:`Gespeicherte Fassung Nr. ${r.id} aktualisiert.`);
 $('#msg').insertAdjacentHTML('beforeend',` <a href="/rezepte#${r.id}" target="_blank" rel="noopener">Ansehen</a>`)}
// Restzeit: typische Dauer je Schritt aus metadaten.db (/api/schaetzung), nach jedem fertigen Schritt neu berechnet.
let S={extrahieren:60000,zutat:8000,ersatz:30000,ersatz_suche:4000,zutaten_schnitt:10,messungen:{}},ETA={};
async function ladeS(){try{const r=await api('/api/schaetzung');if(r&&!r.fehler)S=r}catch(e){}}
const proErsatz=()=>S.ersatz+(s2()?S.ersatz_suche:0);
const dauer=ms=>{const s=Math.max(1,Math.round(ms/1000));return s<60?`${s} s`:`${Math.floor(s/60)} min ${String(s%60).padStart(2,'0')} s`};
function eta(rest,was,arten,schritt){if(rest==null){clearInterval(ETA.t);ETA={};$('#eta').hidden=true;return}
 if(schritt)ETA.schritt=schritt;
 if(was){ETA.start=Date.now();$('#toast').hidden=true;const n=Math.min(...arten.map(a=>(S.messungen||{})[a]||0));ETA.was=was;
  ETA.basis=n?`Schätzung aus ${n>=30?'den letzten 30 früheren Messungen':n==1?'einer früheren Messung':n+' früheren Messungen'}`:'grobe Schätzung, wird mit jeder Nutzung genauer'}
 ETA.ende=Date.now()+rest;if(!ETA.t)ETA.t=setInterval(etaZeig,1000);etaZeig()}
function etaZeig(){if(!ETA.was)return;const now=Date.now(),r=ETA.ende-now,lauf=now-ETA.start,e=$('#eta');e.hidden=false;
 e.querySelector('.et-was').textContent=ETA.was;e.querySelector('.et-s').textContent=ETA.schritt||'';
 const z=e.querySelector('.et-z');z.className='et-z'+(r>0?'':' lang');z.textContent=r>0?`noch etwa ${dauer(r)}`:'dauert länger als geschätzt …';
 e.querySelector('.et-bar i').style.width=(r>0?Math.min(99,lauf/(lauf+r)*100):99)+'%';
 e.querySelector('.et-b').textContent=`läuft seit ${dauer(lauf)} · ${ETA.basis}`}
// Benachrichtigung, wenn ein Schritt fertig ist: Hinweis auf der Seite; ist der Tab im Hintergrund, zusätzlich eine Systemmitteilung (falls erlaubt) und ein Haken im Tab-Titel.
const TITEL=document.title;let TT;
function erlaubnis(){tonBereit();try{if('Notification' in window&&Notification.permission==='default')Notification.requestPermission()}catch(e){}}
function fertig(titel,text,warn,ziel){const t=$('#toast');clearTimeout(TT);
 ton(warn);t.className=warn?'warn':'';t.innerHTML=`<div class="tt"><b>${esc(titel)}</b><small>${esc(text)}</small></div><button aria-label="Hinweis schließen">×</button>`;t.hidden=false;
 t.onclick=ev=>{t.hidden=true;if(ev.target.tagName!=='BUTTON'&&ziel&&$(ziel))$(ziel).scrollIntoView({behavior:'smooth'})};TT=setTimeout(()=>t.hidden=true,warn?15000:8000);
 if(document.hidden){document.title=(warn?'⚠ ':'✓ ')+titel+' – '+TITEL;
  try{if('Notification' in window&&Notification.permission==='granted'){const n=new Notification(titel,{body:text,tag:'recipe-to-rewe'});n.onclick=()=>{focus();n.close()}}}catch(e){}}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)document.title=TITEL});
// Ton bei „fertig“: kurzer Zweiklang, erzeugt im Browser (keine Audiodatei). Aufsteigend = alles gut, absteigend = bitte prüfen.
// Browser erlauben Ton erst nach einem Klick; deshalb wird der Tonerzeuger beim Klick auf „Rezept verarbeiten“ usw. vorbereitet.
let AC;
function tonBereit(){try{AC=AC||new (window.AudioContext||window.webkitAudioContext)();if(AC.state==='suspended')AC.resume()}catch(e){}}
function ton(warn){if(!$('#ton').checked||!AC)return;
 try{const t0=AC.currentTime+.05;(warn?[[523,0],[392,.2]]:[[659,0],[880,.16]]).forEach(([f,d])=>{const o=AC.createOscillator(),g=AC.createGain();
  o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0,t0+d);g.gain.linearRampToValueAtTime(.2,t0+d+.02);g.gain.exponentialRampToValueAtTime(.001,t0+d+.45);
  o.connect(g).connect(AC.destination);o.start(t0+d);o.stop(t0+d+.5)})}catch(e){}}
