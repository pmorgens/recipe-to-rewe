const $=s=>document.querySelector(s);let R,R0,P=[],NF=[],ST,M={},EL={};
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
 $('#modell').onchange=e=>save({modell:e.target.value});$('#s2').onchange=e=>save({stufe2:e.target.checked});
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
 if(r.fehler)return msg(r.fehler,1);$('#txt').value=r.text;msg(r.warnung||'Rezept geladen. Bitte kurz prüfen und „Rezept verarbeiten“ klicken.',!!r.warnung)};
$('#go').onclick=async()=>{if(!M.markt)return msg('Bitte zuerst einen REWE-Markt wählen.',1);lock(1);msg('Rezept wird extrahiert … (bei lokalen Modellen kann das etwas dauern)');
 const r=await api('/api/extract',{text:$('#txt').value});if(r.fehler){lock(0);return msg(r.fehler,1)}
 R=r;R0={z:r.zutaten.length,s:r.schritte.length};P=r.zutaten.map(()=>({}));NF=[];
 $('#schr').value=r.schritte.join('\n');$('#prep').hidden=false;$('#res').hidden=true;draw();let w=[...r.warnungen];
 if(s2()){for(let i=0;i<R.zutaten.length;i++){msg(`Produktsuche ${i+1} von ${R.zutaten.length} …`);
  const p=await api('/api/products',{name:R.zutaten[i].name});if(p.fehler){w.push(p.fehler);break}
  P[i]=p;if(!p.uebersprungen&&p.wahl<0)NF[i]=true;draw()}}
 lock(0);msg(w.join(' · '),w.length)};
$('#mk').onclick=async()=>{R.schritte=$('#schr').value.split('\n').map(s=>s.trim()).filter(Boolean);
 const idx=R.zutaten.map((_,i)=>NF[i]?i:-1).filter(i=>i>=0),E={},used=[];lock(1);let w=[],bad=0;
 for(const[k,i]of idx.entries()){msg(`Ersatz für Zutat ${k+1} von ${idx.length} …`);
  const e=await api('/api/substitute',{rezept:R,index:i,bisher:used});
  if(e.fehler){E[i]={ok:false,grund:e.fehler};w.push(e.fehler);if(++bad>=2)break}else{bad=0;E[i]=e;if(e.ok)used.push(e.ersatz)}}
 idx.forEach(i=>{if(!E[i])E[i]={ok:false,grund:'Nicht versucht, weil davor mehrere Anfragen fehlgeschlagen sind.'}});
 EL=E;lock(0);msg(w.join(' · '),w.length);render(E)};
$('#res').onclick=async ev=>{const b=ev.target.closest('.retry');if(!b)return;const i=+b.dataset.i;lock(1);msg('Ersatz wird erneut angefragt …');
 const used=Object.values(EL).filter(x=>x&&x.ok).map(x=>x.ersatz),r=await api('/api/substitute',{rezept:R,index:i,bisher:used});
 lock(0);EL[i]=r.fehler?{ok:false,grund:r.fehler}:r;msg(r.fehler||'',!!r.fehler);render(EL,true)};
const norm=s=>String(s||'').toLowerCase().replace(/\s+/g,' ').trim();
const amount=z=>{const m=((z.menge||'')+' '+(z.einheit||'')).trim();if(m)return m;
 const t=String(z.text||'').match(/^\s*(\d[\d.,/–-]*\s*(?:[A-Za-zäöüÄÖÜ.]{1,12})?)\s/);return t?t[1].trim():''};
const orig=z=>norm(z.text)!=norm(z.name)?`<small>Original: ${esc(z.text)}</small>`:'';
function render(E,noscroll){const st=s2(),stand=(P.find(p=>p.stand)||{}).stand||new Date().toISOString().slice(0,10),hints={},open=[];
 const items=R.zutaten.map((z,i)=>{const p=P[i]||{},e=E[i];let tag,cls,main=esc(z.name),sub='',im='',am=amount(z);
  if(NF[i]&&e&&e.ok){tag='Ersatz'+(e.unsicher?' – unsicher':'');cls='wa';am=e.menge||am;main=esc(e.ersatz);
   const pk=e.produkt&&e.produkt.wahl>=0?e.produkt.kandidaten[e.produkt.wahl]:null;im=img(pk,'class="rimg"');
   sub=`${e.mischung?`<div class="mix"><b>Mischung:</b> ${esc(e.mischung)}</div>`:''}`+
    (pk?`<div><a href="${esc(pk.url)}">${esc(pk.name)}</a>${det(pk)?'<br><small>'+det(pk)+'</small>':''}</div>`:e.produkt?'<small>Kein passendes Produkt im Online-Sortiment gefunden.</small><br>':'')+
    (e.mix_produkte&&e.mix_produkte.length?`<div class="mix"><b>Im Online-Sortiment:</b><br>${e.mix_produkte.map(m=>m.produkt?`${esc(m.name)}: <a href="${esc(m.produkt.url)}">${esc(m.produkt.name)}</a>`:m.standard?`${esc(m.name)}: Standardzutat`:`${esc(m.name)}: kein Produkt gefunden`).join('<br>')}</div>`:'')+
    `<small>${esc(e.begruendung)}<br>statt: ${esc(z.text)}</small>`;
   e.schritte.forEach(x=>(hints[x.nr]=hints[x.nr]||[]).push(`${esc(e.ersatz)}: ${esc(x.hinweis)}`))}
  else if(NF[i]){tag='Im Markt prüfen';cls='wa';sub=`<small class="s-wa">Kein Ersatz: ${esc((e&&e.grund)||'keine Antwort')}</small> <button class="retry noprint" data-i="${i}">Erneut versuchen</button><br>`+orig(z);open.push(z.text)}
  else if(p.standard){tag='Standardzutat';cls='mu';main=esc(p.standard.name);im=img(p.standard,'class="rimg"');sub=orig(z)}
  else if(st&&p.wahl>=0){const k=p.kandidaten[p.wahl];tag='Produkt zugeordnet';cls='ok';im=img(k,'class="rimg"');
   sub=`<a href="${esc(k.url)}">${esc(k.name)}</a>${det(k)?'<br><small>'+det(k)+'</small>':''}${orig(z)?'<br>'+orig(z):''}`}
  else if(st&&p.kandidaten&&!p.uebersprungen){tag='Im Markt prüfen';cls='wa';sub=orig(z);open.push(z.text)}
  else{tag='Übernommen';cls='mu';sub=orig(z)}
  return `<li><div class="mg">${am?esc(am):'<span class="mu" title="Keine Mengenangabe im Rezepttext">–</span>'}</div><div class="nm"><b>${main}</b><span class="tag ${cls}">${tag}</span>${sub?'<br>'+sub:''}</div>${im}</li>`}).join('');
 const warn=(R.zutaten.length!=R0.z||R.schritte.length!=R0.s)?`<p class="s-wa">Warnung: Anzahl Zutaten/Schritte weicht von der Extraktion ab (${R0.z}/${R0.s}).</p>`:'';
 const noamt=R.zutaten.every(z=>!amount(z))?'<p class="s-wa">Im Rezepttext wurden keine Mengenangaben erkannt. Bitte die Zutatenliste mit Mengen einfügen und das Rezept erneut verarbeiten.</p>':'';
 $('#res').innerHTML=`<article class="rez"><h2>${esc(R.rezeptname)}</h2>
 <p class="meta">${R.portionen?esc(R.portionen)+' Portionen · ':''}${esc(mtxt()||'Markt nicht angegeben')} · ${new Date().toLocaleDateString('de-DE')}</p>${warn}${noamt}
 <div class="rg"><section><h3>Zutaten</h3><ul class="zl">${items}</ul></section>
 <section><h3>Zubereitung</h3><ol class="st">${R.schritte.map((t,i)=>`<li>${esc(t)}${(hints[i+1]||[]).map(h=>`<div class="hint">Hinweis zum Ersatz – ${h}</div>`).join('')}</li>`).join('')}</ol></section></div>
 ${open.length?`<div class="open"><b>Offene Punkte – im Markt prüfen</b><ul>${open.map(o=>`<li>${esc(o)}</li>`).join('')}</ul></div>`:''}
 <p class="fest">${st?`Produktzuordnung aus dem REWE-Online-Sortiment (Stand: ${stand}). Filialbestand nicht geprüft.`:'Nicht gegen den Bestand des Marktes geprüft.'}</p></article>
 <p class="noprint"><button onclick="print()">Drucken / als PDF speichern</button></p>`;
 $('#res').hidden=false;if(!noscroll)$('#res').scrollIntoView()}
