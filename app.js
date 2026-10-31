/* Tara Desk - invoice PWA. Backend = Google Sheet via the Apps Script web app (see ../backend). */
(function(){
"use strict";
var STAR="assets/star.png", QRIMG="assets/upi-qr.png";
var DEFAULTS={
  address:"Opposite Rajalakshmi Genguswamy Kalyana Mandapam, SV Puram, Udumalpet – 642128, Tamil Nadu",
  phone:"96551 99933", email:"hi@taradesigns.shop", website:"taradesigns.shop", instagram:"@taradesigns.shop",
  payment:"", services:"Blouse · Salwar · Sequin Work · Logos · Dupatta Borders · Bulk Orders",
  terms:"Goods once delivered are non-returnable. Thank you for choosing Tara Designs.", theme:"brand"
};
var settings=Object.assign({},DEFAULTS);
var history=[], customers=[], rates=[], designs=[], payments=[], bset={};
var lockedNo=null;                      // set once the invoice is saved (number issued by the Sheet)
var items=[{desc:"",qty:1,rate:0}];
var online=true, saving=false, exporting=false;

function $(id){ return document.getElementById(id); }
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }
function pad(n,l){ n=String(n); while(n.length<l) n="0"+n; return n; }
function todayStr(){ var d=new Date(); return d.getFullYear()+"-"+pad(d.getMonth()+1,2)+"-"+pad(d.getDate(),2); }
function money(n){ return Number(n||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtDate(s){ if(!s) return ""; s=String(s).slice(0,10); var p=s.split("-"); if(p.length<3) return s; return p[2]+"/"+p[1]+"/"+p[0]; }
function num(v){ var n=parseFloat(String(v).replace(/,/g,"")); return isNaN(n)?0:n; }
function lsGet(k){ try{ var r=localStorage.getItem(k); return r?JSON.parse(r):null; }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
function toast(msg){ var t=$("toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(toast._t); toast._t=setTimeout(function(){t.classList.remove("show");},2600); }
function setSync(state,txt){ $("syncDot").className="dot"+(state?" on":""); $("syncTxt").textContent=txt; }
function fyLabel(dateStr){ var d=new Date((dateStr||todayStr())+"T00:00:00"); var y=d.getFullYear(), m=d.getMonth()+1, s=m>=4?y:y-1; return pad(s%100,2)+"-"+pad((s+1)%100,2); }
function docId(no){ return String(no).replace(/\//g,"-").replace(/[^A-Za-z0-9_\-.]/g,"_"); }

/* ---------- Backend (Apps Script web app) ---------- */
function getCfg(){ return lsGet("td_cfg")||{url:"",token:""}; }
async function api(action,data){
  var cfg=getCfg(); if(!cfg.url||!cfg.token) throw new Error("Not connected — open Settings and add your Sheet link to use this");
  var ctrl=new AbortController(), to=setTimeout(function(){ctrl.abort();},45000);
  try{
    var r=await fetch(cfg.url,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({token:cfg.token,action:action,data:data||{}}),redirect:"follow",signal:ctrl.signal});
    var j=await r.json(); if(!j.ok) throw new Error(j.error==="unauthorized"?"Token not accepted — check Settings":(j.error||"Server error"));
    return j.data;
  }catch(e){ if(e.name==="AbortError") throw new Error("Timed out — check your connection"); if(e instanceof TypeError) throw new Error("No connection"); throw e; }
  finally{ clearTimeout(to); }
}
// Setup link: open  https://<app>/#cfg=<base64 of {"url":"...","token":"..."}>  once on a phone to connect it.
(function applySetupLink(){
  var m=location.hash.match(/cfg=([^&]+)/); if(!m) return;
  try{ var c=JSON.parse(atob(decodeURIComponent(m[1]))); if(c.url&&c.token) lsSet("td_cfg",{url:c.url,token:c.token}); }catch(e){}
  history_replace();
  function history_replace(){ try{ window.history.replaceState(null,"",location.pathname+location.search); }catch(e){} }
})();

async function loadBootstrap(){
  var c=lsGet("td_cache"); if(c){ customers=c.customers||[]; rates=c.rates||[]; designs=c.designs||[]; bset=c.settings||{}; fillLists(); }
  try{
    var b=await api("bootstrap"); customers=b.customers||[]; rates=b.rates||[]; designs=b.designs||[]; bset=b.settings||{};
    lsSet("td_cache",{customers:customers,rates:rates,designs:designs,settings:bset}); fillLists();
    online=true; setSync(true,"Connected to your Sheet");
  }catch(e){ online=false; setSync(false,(getCfg().token?e.message:"Not connected — open Settings")); }
  if(!getCfg().token || (!online && !designs.length)) await loadDemo();
}
// Demo catalog: 14 dummy designs (B01–B06, I01–I08) so the app can be tried before the real library is synced.
async function loadDemo(){
  try{ var r=await fetch("demo/designs.json"); var d=await r.json(); if(!designs.length){ designs=d; fillLists(); setSync(false,"Demo designs — connect your Sheet in Settings"); } }catch(e){}
}
function fillLists(){
  $("custList").innerHTML=customers.map(function(c){return '<option value="'+esc(c["Name"])+'">';}).join("");
  $("rateList").innerHTML=rates.map(function(r){return '<option value="'+esc(r["Item"])+'">';}).join("");
  $("designList").innerHTML=designs.map(function(d){return '<option value="'+esc(d["Design name"])+'">';}).join("");
  if(window.__renderMore) window.__renderMore();
  if($("v-quote").classList.contains("on")) renderQuote();
}

/* ---------- Amount in words (Indian system) ---------- */
var A=["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
var B=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
function two(n){ return n<20?A[n]:B[Math.floor(n/10)]+(n%10?" "+A[n%10]:""); }
function three(n){ var s=""; if(n>=100){ s+=A[Math.floor(n/100)]+" Hundred"; n%=100; if(n) s+=" "; } if(n) s+=two(n); return s; }
function words(n){
  n=Math.round(n); if(n<=0) return "Zero";
  var p=[], cr=Math.floor(n/1e7); n%=1e7; var lk=Math.floor(n/1e5); n%=1e5; var th=Math.floor(n/1e3); n%=1e3;
  if(cr) p.push(three(cr)+" Crore"); if(lk) p.push(three(lk)+" Lakh"); if(th) p.push(three(th)+" Thousand"); if(n) p.push(three(n));
  return p.join(" ");
}

/* ---------- Form state ---------- */
function predictedNo(){
  var prefix="TD/INV"+fyLabel($("fDate").value)+"/", max=0;
  history.forEach(function(h){ var n=String(h["Invoice no."]||""); if(n.indexOf(prefix)===0){ var k=parseInt(n.slice(prefix.length),10); if(k>max) max=k; } });
  return history.length||online ? prefix+pad(max+1,4) : prefix+"____";
}
function readForm(){
  return {
    number:lockedNo||predictedNo(), date:$("fDate").value, due:$("fDue").value,
    name:$("fName").value.trim(), phone:$("fPhone").value.trim(), addr:$("fAddr").value.trim(),
    items:items.map(function(i){return {desc:String(i.desc||"").trim(),qty:num(i.qty),rate:num(i.rate),designId:i.designId||"",stitches:i.stitches||""};}),
    discount:num($("fDisc").value), notes:$("fNotes").value.trim(), special:$("fSpecial").value.trim(),
    design:$("fDesign").value.trim(), stitches:$("fStitch").value.trim(), fabric:$("fFabric").value.trim(), delivery:$("fDelivery").value,
    advance:num($("fAdv").value), advLabel:$("fAdvLabel").value.trim()
  };
}
function totals(d){
  var sub=0; d.items.forEach(function(i){ sub+=i.qty*i.rate; });
  var disc=Math.min(d.discount,sub), total=sub-disc, adv=Math.min(Math.max(d.advance||0,0),total);
  return {sub:sub,disc:disc,total:total,adv:adv,bal:total-adv};
}

/* ---------- Invoice markup ---------- */
function invoiceHTML(d,copyLabel,compact){
  var t=totals(d), s=settings, rows="", vis=d.items.filter(function(i){return i.desc||i.qty||i.rate;});
  vis.forEach(function(i,idx){ rows+='<tr><td class="c">'+(idx+1)+'</td><td>'+esc(i.desc)+'</td><td class="r">'+esc(i.qty)+'</td><td class="r">'+money(i.rate)+'</td><td class="r">'+money(i.qty*i.rate)+'</td></tr>'; });
  var dense=vis.length>8?" dense":"";
  var facts='<div class="row"><span class="k">Invoice no.</span><span class="v">'+esc(d.number)+'</span></div>'+
    '<div class="row"><span class="k">Date</span><span class="v">'+esc(fmtDate(d.date))+'</span></div>'+
    (d.due?'<div class="row"><span class="k">Due</span><span class="v">'+esc(fmtDate(d.due))+'</span></div>':'');
  var totTop='<div class="row"><span>Subtotal</span><span>₹ '+money(t.sub)+'</span></div>'+(t.disc>0?'<div class="row"><span>Discount</span><span>– ₹ '+money(t.disc)+'</span></div>':'');
  var totBot='<div class="grand"><span>Total</span><span>₹ '+money(t.total)+'</span></div>'+
    (t.adv>0?'<div class="row"><span>'+esc(d.advLabel||"Advance received")+'</span><span>– ₹ '+money(t.adv)+'</span></div><div class="row bal"><span>Balance due</span><span>₹ '+money(t.bal)+'</span></div>':'');
  var oc=[["Design",d.design],["Stitches",d.stitches],["Fabric",d.fabric],["Delivery",d.delivery?fmtDate(d.delivery):""]].filter(function(c){return c[1];});
  var strip=oc.length?'<div class="inv-order">'+oc.map(function(c){return '<div><div class="lbl">'+c[0]+'</div><div class="val">'+esc(c[1])+'</div></div>';}).join("")+'</div>':"";
  var pay;
  if(t.total>0 && t.bal<=0.004) pay='<div class="paidstamp">Paid in full</div>';
  else pay='<div class="paycard"><div class="payhead"><span>₹</span> Scan &amp; pay · UPI</div><div class="payqr"><div class="qr"><img src="'+QRIMG+'" alt="UPI payment QR"></div><div class="qrtxt"><span class="amt">Scan to pay</span><span class="pl">Any UPI app</span><span class="apps">GPay · PhonePe · Paytm<br>BHIM · bank apps</span></div></div></div>';
  var nb="";
  if(d.special) nb+='<p class="special">'+esc(d.special)+'</p>';
  if(d.notes) nb+='<p>'+esc(d.notes)+'</p>';
  if(s.payment) nb+='<p><strong>Pay to:</strong> '+esc(s.payment)+'</p>';
  if(s.terms) nb+='<p>'+esc(s.terms)+'</p>';
  var IC={
    phone:'<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/></svg>',
    web:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z"/></svg>',
    insta:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6"/></svg>',
    mail:'<svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 6 10 7 10-7"/></svg>'};
  var contact=[[IC.phone,s.phone],[IC.web,s.website],[IC.insta,s.instagram],[IC.mail,s.email]].filter(function(c){return c[1];}).map(function(c){return c[0]+esc(c[1]);}).join('</span><span>');
  return '<div class="inv'+dense+(compact?' compact':'')+(s.theme==="deep"?' deep':'')+'">'+
    '<div class="inv-head"><div class="inv-top"><img class="inv-mark" src="'+STAR+'" alt="">'+
      '<div class="inv-brand"><div class="inv-name">Tara Designs</div><div class="inv-tag">Computerized Embroidery</div></div>'+
      '<div class="inv-title"><div class="inv-word">Invoice</div><div class="inv-copy">'+esc(copyLabel)+'</div></div></div>'+
      '<div class="inv-addr">'+esc(s.address)+'</div>'+(s.phone?'<div class="inv-phone"><small>Call / WhatsApp</small>'+esc(s.phone)+'</div>':'')+'</div>'+
    '<div class="inv-meta"><div class="inv-bill"><div class="lbl">Billed to</div><div class="who">'+esc(d.name||"—")+'</div>'+
      (d.phone?'<div class="sub">'+esc(d.phone)+'</div>':'')+(d.addr?'<div class="sub">'+esc(d.addr).replace(/\n/g,"<br>")+'</div>':'')+'</div>'+
      '<div class="inv-facts">'+facts+'</div></div>'+strip+
    '<div class="inv-body"><table class="inv-table"><thead><tr><th class="c">#</th><th>Description</th><th class="r">Qty</th><th class="r">Rate ₹</th><th class="r">Amount ₹</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<div class="stitch"><span class="run"></span><svg viewBox="0 0 60 10" aria-hidden="true"><path d="M2 5C2 3.3 3.4 2.6 5 2.6L56 4.4 58.5 5 56 5.6 5 7.4C3.4 7.4 2 6.7 2 5Z" fill="#f1c431"/><ellipse cx="4.7" cy="5" rx="1.4" ry="0.95" fill="#fff"/></svg></div>'+
    '<div class="inv-sum"><div class="inv-words"><b>Amount in words</b>Rupees '+words(t.total)+' only</div><div class="inv-tot">'+totTop+'</div>'+
      '<div class="inv-paycell">'+pay+'</div><div class="inv-tot">'+totBot+'</div></div>'+
    '<div class="inv-foot"><div class="inv-note">'+(nb?'<b>Notes</b>'+nb:'')+'</div><div class="inv-sign"><div class="sigline"><strong>For Tara Designs</strong>Authorised signatory</div></div></div>'+
    '<div class="inv-thanks">Thank you for your order</div>'+(s.services?'<div class="inv-services">'+esc(s.services)+'</div>':'')+
    '<div class="inv-contact"><span>'+contact+'</span></div></div>';
}

/* ---------- Rendering ---------- */
var MM=96/25.4;
function fitPreview(){ var st=$("stage"), inv=st.firstElementChild; if(!inv||!st.clientWidth) return; var sc=st.clientWidth/(148.5*MM); inv.style.transform="scale("+sc+")"; st.style.height=(210*MM*sc)+"px"; }
function needsCompact(d){
  var m=document.createElement("div"); m.style.cssText="position:absolute;left:-9999px;top:0;visibility:hidden";
  m.innerHTML=invoiceHTML(d,"x",false); document.body.appendChild(m);
  var el=m.firstChild, over=el.scrollHeight>el.clientHeight+1; document.body.removeChild(m); return over;
}
function render(){
  var d=readForm(), c=needsCompact(d);
  $("fNumber").value=d.number;
  $("stage").innerHTML=invoiceHTML(d,"Original copy",c);
  $("printSheet").innerHTML=invoiceHTML(d,"Original copy",c)+'<div class="cut"></div>'+invoiceHTML(d,"Customer copy",c);
  fitPreview();
  if(!lockedNo) lsSet("td_draft",d);
}
window.addEventListener("resize",fitPreview);

function renderItemRows(){
  var box=$("itemRows"); box.innerHTML="";
  items.forEach(function(it,idx){
    var r=document.createElement("div"); r.className="item-row";
    r.innerHTML='<input data-k="desc" list="rateList" aria-label="Item description" placeholder="Item description" value="'+esc(it.desc)+'">'+
      '<input data-k="qty" class="num" aria-label="Quantity" inputmode="decimal" value="'+esc(it.qty)+'">'+
      '<input data-k="rate" class="num" aria-label="Rate" inputmode="decimal" value="'+esc(it.rate)+'">'+
      '<button class="icon-btn" type="button" aria-label="Remove item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>';
    r.querySelectorAll("input").forEach(function(inp){
      inp.addEventListener("input",function(){ items[idx][inp.dataset.k]=inp.value; render(); });
      if(inp.dataset.k==="desc") inp.addEventListener("change",function(){      // picked a Rate Card item -> fill its default rate
        var m=rates.find(function(x){return String(x["Item"]).toLowerCase()===inp.value.trim().toLowerCase();});
        if(m && Number(m["Default rate (Rs)"])>0 && !num(items[idx].rate)){ items[idx].rate=m["Default rate (Rs)"]; renderItemRows(); render(); }
      });
    });
    r.querySelector("button").addEventListener("click",function(){ if(items.length>1) items.splice(idx,1); else items=[{desc:"",qty:1,rate:0}]; renderItemRows(); render(); });
    box.appendChild(r);
  });
}

function setLocked(no){
  lockedNo=no||null;
  var lb=$("lockbar"); lb.hidden=!lockedNo;
  if(lockedNo) lb.innerHTML='Saved as <b>'+esc(lockedNo)+'</b>. You can re-share or re-download it. To change anything, start a new invoice.';
  $("btnSave").hidden=!!lockedNo; $("btnNew").hidden=!lockedNo;
  document.querySelectorAll("#v-invoice .form-col input, #v-invoice .form-col textarea").forEach(function(el){ if(el.id!=="fNumber") el.disabled=!!lockedNo; });
  document.querySelectorAll("#v-invoice .form-col button").forEach(function(el){ el.disabled=!!lockedNo; });
}
function fillForm(d){
  $("fDate").value=d.date||todayStr(); $("fDue").value=d.due||"";
  $("fName").value=d.name||""; $("fPhone").value=d.phone||""; $("fAddr").value=d.addr||"";
  $("fDisc").value=d.discount?d.discount:""; $("fNotes").value=d.notes||""; $("fSpecial").value=d.special||"";
  $("fDesign").value=d.design||""; $("fStitch").value=d.stitches||""; $("fFabric").value=d.fabric||""; $("fDelivery").value=d.delivery||"";
  $("fAdv").value=d.advance?d.advance:""; $("fAdvLabel").value=d.advLabel||"";
  items=(d.items&&d.items.length?d.items:[{desc:"",qty:1,rate:0}]).map(function(i){return {desc:i.desc,qty:i.qty,rate:i.rate,designId:i.designId||"",stitches:i.stitches||""};});
  renderItemRows(); render();
}
function newInvoice(){ setLocked(null); lsSet("td_draft",null); fillForm({date:todayStr()}); show("invoice"); window.scrollTo({top:0,behavior:"smooth"}); }

/* ---------- Save ---------- */
function busy(on){ saving=on; $("btnSave").textContent=on?"Saving…":"Save invoice"; $("btnSave").disabled=on; }
async function save(){
  if(lockedNo||saving) return !!lockedNo;
  var d=readForm(), t=totals(d), lines=d.items.filter(function(i){return i.desc;});
  if(!d.name){ toast("Add the customer name first"); $("fName").focus(); return false; }
  if(!lines.length){ toast("Add at least one item"); return false; }
  if(t.total<=0){ toast("The total is ₹0 — check the rates"); return false; }
  busy(true);
  try{
    var cid=(await api("upsertCustomer",{name:d.name,phone:d.phone,address:d.addr})).customerId;
    var rec=Object.assign({},d); delete rec.number;
    var res=await api("createInvoice",{
      date:d.date, customerId:cid, customerName:d.name, subtotal:t.total, advance:t.adv,
      notes:[d.special,d.notes].filter(Boolean).join(" | "), details:JSON.stringify(rec),
      lines:lines.map(function(i){return {designId:i.designId||"",description:i.desc,stitches:i.stitches||"",qty:i.qty,rate:i.rate};})
    });
    setLocked(res.invoiceNo); lsSet("td_draft",null); render(); toast("Saved "+res.invoiceNo);
    loadHistory(); loadBootstrap();
    return true;
  }catch(e){ toast("Not saved — "+e.message); return false; }
  finally{ busy(false); }
}

/* ---------- History ---------- */
async function loadHistory(){
  try{ var rows=await api("listInvoices",{}); history=rows.sort(function(a,b){return String(b["Invoice no."]).localeCompare(String(a["Invoice no."]));}); online=true; }
  catch(e){ $("history").innerHTML='<p class="empty">'+esc(e.message)+'</p>'; $("duesList").innerHTML='<p class="empty">'+esc(e.message)+'</p>'; return; }
  try{ payments=await api("listPayments",{}); }catch(e){ payments=payments||[]; }
  renderAll(); render();
}
function renderAll(){ renderHistory(); renderDues(); renderCustomers(); renderReports(); }
function bal(h){ return Number(h["Balance (Rs)"])||0; }
function renderHistory(){
  var box=$("history");
  if(!history.length){ box.innerHTML='<p class="empty">No invoices yet. Save one and it will appear here.</p>'; return; }
  box.innerHTML="";
  history.forEach(function(h){
    var row=document.createElement("div"); row.className="hist-row";
    var st=h["Status"]||"";
    row.innerHTML='<div><div class="hist-no">'+esc(h["Invoice no."])+(st?'<span class="chip '+esc(st)+'">'+esc(st)+'</span>':'')+'</div><div class="hist-sub">'+esc(fmtDate(h["Date"]))+' · '+esc(h["Customer name"]||"—")+'</div>'+
      '<div class="hist-actions"><button class="btn small" data-a="open" type="button">Open</button>'+(bal(h)>0.004?'<button class="btn small gold" data-a="pay" type="button">Record payment</button>':'')+'</div></div>'+
      '<div class="hist-amt">₹ '+money(h["Subtotal (Rs)"])+(bal(h)>0.004?'<div class="hist-sub">Due ₹ '+money(bal(h))+'</div>':'')+'</div>';
    row.querySelector('[data-a="open"]').addEventListener("click",function(){ openInvoice(h["Invoice no."]); });
    var pb=row.querySelector('[data-a="pay"]'); if(pb) pb.addEventListener("click",function(){ openPay(h); });
    box.appendChild(row);
  });
}
async function openInvoice(no){
  toast("Opening "+no+"…");
  try{
    var r=await api("getInvoice",{invoiceNo:no}), inv=r.invoice||{}, d=null;
    try{ if(inv["Details (JSON)"]) d=JSON.parse(inv["Details (JSON)"]); }catch(e){}
    if(!d) d={ date:String(inv["Date"]||"").slice(0,10), name:inv["Customer name"], advance:Number(inv["Advance (Rs)"])||0,
               items:(r.lines||[]).map(function(l){return {desc:l["Description"],qty:l["Qty"],rate:l["Rate (Rs)"]};}) };
    show("invoice"); fillForm(d); setLocked(no); render(); window.scrollTo({top:0,behavior:"smooth"});
  }catch(e){ toast("Could not open — "+e.message); }
}

/* ---------- PDF ---------- */
function b64ToBytes(b64){ var bin=atob(b64), u=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return u; }
function buildPdf(jpeg,w,h){
  var enc=new TextEncoder(), parts=[], offs=[], len=0;
  function add(x){ var u=typeof x==="string"?enc.encode(x):x; parts.push(u); len+=u.length; }
  function obj(n,body){ offs[n]=len; add(n+" 0 obj\n"); add(body); add("\nendobj\n"); }
  var PW=841.89, PH=595.28, content="q "+PW+" 0 0 "+PH+" 0 0 cm /Im0 Do Q";
  add("%PDF-1.4\n");
  obj(1,"<< /Type /Catalog /Pages 2 0 R >>"); obj(2,"<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3,"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "+PW+" "+PH+"] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>");
  obj(4,"<< /Length "+content.length+" >>\nstream\n"+content+"\nendstream");
  offs[5]=len; add("5 0 obj\n<< /Type /XObject /Subtype /Image /Width "+w+" /Height "+h+" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+jpeg.length+" >>\nstream\n"); add(jpeg); add("\nendstream\nendobj\n");
  var xr=len; add("xref\n0 6\n0000000000 65535 f \n");
  for(var i=1;i<=5;i++) add(("0000000000"+offs[i]).slice(-10)+" 00000 n \n");
  add("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"+xr+"\n%%EOF");
  var out=new Uint8Array(len), pos=0; parts.forEach(function(u){ out.set(u,pos); pos+=u.length; });
  return new Blob([out],{type:"application/pdf"});
}
async function makePdf(){
  var d=readForm(), c=needsCompact(d), sheet=document.createElement("div");
  sheet.className="export-sheet";
  sheet.innerHTML=invoiceHTML(d,"Original copy",c)+'<div class="cut"></div>'+invoiceHTML(d,"Customer copy",c);
  document.body.appendChild(sheet);
  try{
    if(document.fonts&&document.fonts.ready) await document.fonts.ready;
    var cv=await html2canvas(sheet,{scale:3,backgroundColor:"#ffffff",useCORS:true,logging:false});
    return {blob:buildPdf(b64ToBytes(cv.toDataURL("image/jpeg",0.93).split(",")[1]),cv.width,cv.height),name:docId(d.number)+".pdf",no:d.number};
  }finally{ if(sheet.parentNode) sheet.parentNode.removeChild(sheet); }
}
async function exportPdf(mode){
  if(exporting) return;
  if(!lockedNo){ var ok=await save(); if(!ok) return; }      // the invoice number comes from the Sheet, so save first
  exporting=true; var b=mode==="share"?$("btnShare"):$("btnDownload"), label=b.textContent; b.disabled=true; b.textContent="Preparing…";
  try{
    var p=await makePdf(), file=new File([p.blob],p.name,{type:"application/pdf"});
    if(mode==="share" && navigator.canShare && navigator.canShare({files:[file]})){
      try{ await navigator.share({files:[file],title:p.no}); }catch(e){ if(e&&e.name!=="AbortError") throw e; }
    }else{
      var a=document.createElement("a"); a.href=URL.createObjectURL(p.blob); a.download=p.name; document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },4000);
      toast("PDF saved — print at 100% on A4, then cut along the dashed line");
    }
  }catch(e){ toast("Couldn't make the PDF — "+(e&&e.message||"try again")); }
  finally{ exporting=false; b.disabled=false; b.textContent=label; }
}

/* ---------- Settings ---------- */
var SMAP={sAddr:"address",sPhone:"phone",sEmail:"email",sWeb:"website",sInsta:"instagram",sServices:"services",sPay:"payment",sTerms:"terms"};
function fillSettings(){ Object.keys(SMAP).forEach(function(id){ $(id).value=settings[SMAP[id]]||""; }); var c=getCfg(); $("cUrl").value=c.url||""; $("cToken").value=c.token||""; }
function syncTheme(){ document.querySelectorAll("#themeSeg button").forEach(function(b){ b.setAttribute("aria-pressed",(b.dataset.t===(settings.theme==="deep"?"deep":"brand"))?"true":"false"); }); }

/* ---------- Navigation ---------- */
var TITLES={quote:"Quote",invoice:"New invoice",history:"Invoices",dues:"Dues",designs:"Designs",customers:"Customers",rates:"Rates",reports:"Reports",settings:"Settings"};
var SUBS={quote:"What should we charge?",invoice:"A5 invoice, PDF on A4",history:"From your Sheet",dues:"Pending payments",designs:"Design library",customers:"Your customers",rates:"Price list",reports:"Sales and collections",settings:"Shop and connection"};
var MAIN=["quote","invoice","history","designs"], curView="quote";
function closeSheet(){ $("moreSheet").hidden=true; $("scrim").hidden=true; document.body.classList.remove("sheet-open"); }
function openSheet(){ try{ window.history.pushState({v:curView,sheet:1},"",""); }catch(e){} $("moreSheet").hidden=false; $("scrim").hidden=false; document.body.classList.add("sheet-open"); }
function show(v,noPush){
  closeSheet(); curView=v;
  document.querySelectorAll(".view").forEach(function(el){ el.classList.toggle("on",el.id==="v-"+v); });
  document.querySelectorAll("#nav button").forEach(function(b){ var on=b.dataset.v===v||(b.dataset.v==="more"&&MAIN.indexOf(v)<0); b.setAttribute("aria-pressed",on?"true":"false"); });
  $("barTitle").textContent=TITLES[v]||"Tara Desk"; $("barSub").textContent=SUBS[v]||"Tara Designs";
  $("actionbar").hidden=(v!=="invoice"); $("fabNew").hidden=(v!=="history");
  document.body.classList.toggle("has-actionbar",v==="invoice");
  if(!noPush){ try{ window.history.pushState({v:v},"",""); }catch(e){} }
  if(v==="history"||v==="dues"||v==="customers"||v==="reports") loadHistory();
  if(v==="designs") renderDesigns(true);
  if(v==="quote"){ renderQuote(); }
  if(v==="rates") renderRates();
  if(v==="invoice"){ setInvTab("form"); setTimeout(fitPreview,60); }
  window.scrollTo(0,0);
}
function setInvTab(t){
  var v=$("v-invoice"); v.classList.toggle("tab-prev",t==="prev");
  document.querySelectorAll("#invTabs button").forEach(function(b){ b.setAttribute("aria-pressed",b.dataset.t===t?"true":"false"); });
  if(t==="prev") setTimeout(fitPreview,30);
}

/* ---------- Wire up ---------- */
["fDate","fDue","fName","fPhone","fAddr","fDisc","fNotes","fSpecial","fDesign","fStitch","fFabric","fDelivery","fAdv","fAdvLabel"].forEach(function(id){ $(id).addEventListener("input",render); });
$("fName").addEventListener("change",function(){       // picked an existing customer -> fill phone and address
  var m=customers.find(function(c){return String(c["Name"]).toLowerCase()===$("fName").value.trim().toLowerCase();});
  if(m){ if(!$("fPhone").value) $("fPhone").value=m["Phone"]||""; if(!$("fAddr").value) $("fAddr").value=m["Address"]||""; render(); }
});
Object.keys(SMAP).forEach(function(id){ $(id).addEventListener("input",function(){ settings[SMAP[id]]=$(id).value.trim(); lsSet("td_settings",settings); render(); }); });
document.querySelectorAll("#themeSeg button").forEach(function(b){ b.addEventListener("click",function(){ settings.theme=b.dataset.t; lsSet("td_settings",settings); syncTheme(); render(); }); });
document.querySelectorAll("#nav button").forEach(function(b){ b.addEventListener("click",function(){ if(b.dataset.v==="more"){ if($("moreSheet").hidden) openSheet(); else window.history.back(); } else show(b.dataset.v); }); });
document.querySelectorAll("#moreSheet button").forEach(function(b){ b.addEventListener("click",function(){ show(b.dataset.v); }); });
$("scrim").addEventListener("click",function(){ window.history.back(); });
document.querySelectorAll("#invTabs button").forEach(function(b){ b.addEventListener("click",function(){ setInvTab(b.dataset.t); }); });
$("fabNew").addEventListener("click",function(){ show("invoice"); });
window.addEventListener("popstate",function(e){ if(!$("moreSheet").hidden){ closeSheet(); return; } var v=(e.state&&e.state.v)||"quote"; show(v,true); });
try{ window.history.replaceState({v:"quote"},"",""); }catch(e){}
/* touch ripple on buttons (Android feel) */
document.addEventListener("pointerdown",function(e){
  var b=e.target.closest&&e.target.closest(".btn,.bnav button,.sheet-list button,.fab,.chip.pick,.tabseg button,.seg button");
  if(!b) return; var r=b.getBoundingClientRect(), d=Math.max(r.width,r.height)*2, sp=document.createElement("span");
  sp.className="ripple"; sp.style.cssText="width:"+d+"px;height:"+d+"px;left:"+(e.clientX-r.left-d/2)+"px;top:"+(e.clientY-r.top-d/2)+"px";
  b.appendChild(sp); setTimeout(function(){ sp.remove(); },600);
},{passive:true});

$("addItem").addEventListener("click",function(){ items.push({desc:"",qty:1,rate:0}); renderItemRows(); render(); var r=$("itemRows").querySelectorAll(".item-row"); r[r.length-1].querySelector("input").focus(); });
$("btnSave").addEventListener("click",save);
$("btnShare").addEventListener("click",function(){ exportPdf("share"); });
$("btnDownload").addEventListener("click",function(){ exportPdf("download"); });
$("btnNew").addEventListener("click",newInvoice);
$("btnRefresh").addEventListener("click",loadHistory);
$("btnConnect").addEventListener("click",async function(){
  var url=$("cUrl").value.trim(), token=$("cToken").value.trim(), msg=$("connMsg");
  if(!url||!token){ msg.textContent="Enter both the URL and the token."; return; }
  lsSet("td_cfg",{url:url,token:token}); msg.textContent="Testing…";
  try{ await api("bootstrap"); msg.textContent="Connected. Your customers and rate card are loaded."; await loadBootstrap(); loadHistory(); }
  catch(e){ msg.textContent="Not connected — "+e.message; setSync(false,e.message); }
});
window.addEventListener("online",function(){ loadBootstrap(); });
window.addEventListener("offline",function(){ online=false; setSync(false,"Offline — you can still view and share saved PDFs you opened"); });

/* ================= Dues, payments, customers, designs, rates, reports ================= */
function waLink(phone,msg){ var d=String(phone||"").replace(/\D/g,""); if(d.length===10) d="91"+d; return d?"https://wa.me/"+d+"?text="+encodeURIComponent(msg):""; }
function phoneOf(name){ var m=customers.find(function(c){return String(c["Name"]).toLowerCase()===String(name).toLowerCase();}); return m?String(m["Phone"]||""):""; }
function thumb(link){ if(/^demo\//.test(String(link||""))) return link; var m=String(link||"").match(/[?&]id=([^&]+)/)||String(link||"").match(/\/d\/([^/?]+)/); return m?"https://drive.google.com/thumbnail?id="+m[1]+"&sz=w500":""; }
function el(tag,cls,html){ var e=document.createElement(tag); if(cls) e.className=cls; if(html!=null) e.innerHTML=html; return e; }

/* ---- payments ---- */
var payFor=null;
function openPay(h){
  payFor=h; $("payInfo").textContent=h["Invoice no."]+" · "+(h["Customer name"]||"")+" · due ₹ "+money(bal(h));
  $("pAmt").value=bal(h); $("pDate").value=todayStr(); $("pNote").value=""; $("pMode").selectedIndex=0;
  if($("payDlg").showModal) $("payDlg").showModal(); else $("payDlg").setAttribute("open","");
}
$("pCancel").addEventListener("click",function(){ $("payDlg").close(); });
$("pSave").addEventListener("click",async function(){
  var amt=num($("pAmt").value), b=$("pSave");
  if(!payFor||amt<=0){ toast("Enter the amount received"); return; }
  if(amt>bal(payFor)+0.5){ toast("That is more than the balance due"); return; }
  b.disabled=true; b.textContent="Saving…";
  try{
    await api("addPayment",{invoiceNo:payFor["Invoice no."],amount:amt,mode:$("pMode").value,date:$("pDate").value,note:$("pNote").value.trim()});
    $("payDlg").close(); toast("Payment recorded"); await loadHistory();
  }catch(e){ toast("Not saved — "+e.message); }
  finally{ b.disabled=false; b.textContent="Save payment"; }
});

/* ---- dues ---- */
function renderDues(){
  var box=$("duesList"), open=history.filter(function(h){return bal(h)>0.004;}), g={};
  open.forEach(function(h){ var k=h["Customer name"]||"—"; (g[k]=g[k]||[]).push(h); });
  var total=open.reduce(function(s,h){return s+bal(h);},0);
  $("duesTotal").hidden=!open.length; $("duesTotal").textContent="₹ "+money(total);
  if(!open.length){ box.innerHTML='<p class="empty">Nothing pending. Every invoice is paid.</p>'; return; }
  box.innerHTML="";
  Object.keys(g).sort(function(a,b){ return g[b].reduce(function(s,h){return s+bal(h);},0)-g[a].reduce(function(s,h){return s+bal(h);},0); }).forEach(function(name){
    var list=g[name], sum=list.reduce(function(s,h){return s+bal(h);},0), ph=phoneOf(name);
    var grp=el("div","grp"), head=el("div","grp-h",'<b>'+esc(name)+'</b><span class="amt">₹ '+money(sum)+'</span>');
    grp.appendChild(head);
    list.forEach(function(h){
      var r=el("div","rowline",'<div>'+esc(h["Invoice no."])+'<div class="sub">'+esc(fmtDate(h["Date"]))+' · due ₹ '+money(bal(h))+'</div></div>');
      var b=el("button","btn small gold","Record payment"); b.type="button"; b.addEventListener("click",function(){ openPay(h); }); r.appendChild(b); grp.appendChild(r);
    });
    var msg="Hello "+name+", a gentle reminder from Tara Designs: ₹ "+money(sum)+" is pending ("+list.map(function(h){return h["Invoice no."];}).join(", ")+"). Thank you!";
    var wl=waLink(ph,msg);
    if(wl){ var a=el("a","btn small","Remind on WhatsApp"); a.href=wl; a.target="_blank"; a.rel="noopener"; a.style.marginTop="6px"; grp.appendChild(a); }
    else grp.appendChild(el("p","hint","No phone number saved for this customer."));
    box.appendChild(grp);
  });
}

/* ---- customers ---- */
function renderCustomers(){
  var q=$("cSearch").value.trim().toLowerCase(), box=$("custListView");
  var agg={}; history.forEach(function(h){ var k=String(h["Customer name"]||"").toLowerCase(); var a=agg[k]=agg[k]||{n:0,billed:0,due:0,list:[]}; a.n++; a.billed+=Number(h["Subtotal (Rs)"])||0; a.due+=Math.max(bal(h),0); a.list.push(h); });
  var list=customers.filter(function(c){ return !q||String(c["Name"]).toLowerCase().indexOf(q)>=0||String(c["Phone"]||"").replace(/\s/g,"").indexOf(q.replace(/\s/g,""))>=0; });
  if(!list.length){ box.innerHTML='<p class="empty">'+(customers.length?"No match.":"No customers yet. They are added when you save an invoice.")+'</p>'; return; }
  box.innerHTML="";
  list.forEach(function(c){
    var a=agg[String(c["Name"]).toLowerCase()]||{n:0,billed:0,due:0,list:[]};
    var grp=el("div","grp"), head=el("div","grp-h",'<div><b>'+esc(c["Name"])+'</b><div class="hist-sub">'+esc(c["Phone"]||"No phone")+' · '+a.n+' invoice'+(a.n===1?"":"s")+'</div></div><span class="amt">₹ '+money(a.billed)+(a.due>0?'<div class="hist-sub" style="text-align:right">Due ₹ '+money(a.due)+'</div>':'')+'</span>');
    head.style.cursor="pointer"; grp.appendChild(head);
    var det=el("div",""); det.hidden=true; det.style.marginTop="10px";
    det.innerHTML='<div class="grid2"><div class="field"><label>Phone</label><input class="cp" value="'+esc(c["Phone"]||"")+'" inputmode="tel"></div><div class="field"><label>Address</label><input class="ca" value="'+esc(c["Address"]||"")+'"></div></div>'+
      '<div class="actions"><button class="btn small primary" data-a="save" type="button">Save</button><button class="btn small gold" data-a="inv" type="button">New invoice</button>'+
      (c["Phone"]?'<a class="btn small" href="tel:'+esc(String(c["Phone"]).replace(/\s/g,""))+'">Call</a>':'')+'</div>';
    a.list.slice(0,5).forEach(function(h){ var r=el("div","rowline",'<div>'+esc(h["Invoice no."])+'<div class="sub">'+esc(fmtDate(h["Date"]))+' · ₹ '+money(h["Subtotal (Rs)"])+'</div></div>'); var b=el("button","btn small ghost","Open"); b.type="button"; b.addEventListener("click",function(){ openInvoice(h["Invoice no."]); }); r.appendChild(b); det.appendChild(r); });
    grp.appendChild(det); head.addEventListener("click",function(){ det.hidden=!det.hidden; });
    det.querySelector('[data-a="save"]').addEventListener("click",async function(){
      try{ await api("upsertCustomer",{name:c["Name"],phone:det.querySelector(".cp").value.trim(),address:det.querySelector(".ca").value.trim()}); toast("Saved"); await loadBootstrap(); renderCustomers(); }catch(e){ toast("Not saved — "+e.message); }
    });
    det.querySelector('[data-a="inv"]').addEventListener("click",function(){ newInvoice(); $("fName").value=c["Name"]; $("fPhone").value=c["Phone"]||""; $("fAddr").value=c["Address"]||""; render(); });
    box.appendChild(grp);
  });
}
$("cSearch").addEventListener("input",renderCustomers);
$("btnAddCust").addEventListener("click",async function(){
  var n=$("nName").value.trim(); if(!n){ toast("Enter a name"); return; }
  try{ await api("upsertCustomer",{name:n,phone:$("nPhone").value.trim(),address:$("nAddr").value.trim()}); $("nName").value=$("nPhone").value=$("nAddr").value=""; toast("Customer saved"); await loadBootstrap(); renderCustomers(); }
  catch(e){ toast("Not saved — "+e.message); }
});

/* ---- designs ---- */
var D_PAGE=24, dShown=D_PAGE;
/* ---- pricing formula ---- */
var PK={hourly:["Price: hourly rate (Rs)",200],spm:["Price: stitches per minute",500],cc:["Price: minutes per colour change",10],handling:["Price: handling per piece (Rs)",30],min:["Price: minimum per piece (Rs)",300],job:["Price: job setup (Rs)",0],round:["Price: round up to (Rs)",10]};
function pp(k){ var v=bset[PK[k][0]]; v=(v===""||v==null)?PK[k][1]:Number(v); return isNaN(v)?PK[k][1]:v; }
function quote(stitches,colours,qty,extraPct,frames){
  var spm=pp("spm")>0?pp("spm"):500, minutes=stitches/spm+colours*pp("cc"), machine=minutes/60*pp("hourly"), handling=pp("handling")*Math.max(1,frames||1);
  var raw=handling+machine, floor=raw<pp("min"), base=Math.max(raw,pp("min")), extra=base*(extraPct||0)/100; base+=extra;
  var r=pp("round"), per=r>0?Math.ceil(base/r-1e-9)*r:Math.round(base); qty=Math.max(1,Math.round(qty||1));
  return {minutes:minutes,machine:machine,handling:handling,floor:floor,extra:extra,per:per,qty:qty,job:pp("job"),total:pp("job")+per*qty};
}
function normCode(s){ return String(s||"").toLowerCase().replace(/[\s_\-\.]+/g,""); }
function findDesign(code){ var c=normCode(code); if(!c) return null; return designs.find(function(d){return normCode(d["Design name"])===c;})||null; }
function designQuote(d,qty,extra){ return quote(num(d["Stitch count"]),num(d["Colour changes"]),qty,extra); }
function hm(min){ min=Math.round(min); return min>=60?Math.floor(min/60)+" h "+(min%60)+" min":min+" min"; }
function suggested(d){ return designQuote(d,1,0).per; }
function renderDesigns(reset){
  if(reset) dShown=D_PAGE;
  var cats=[]; designs.forEach(function(d){ var c=d["Category"]; if(c&&cats.indexOf(c)<0) cats.push(c); });
  var sel=$("dCat"), cur=sel.value; sel.innerHTML='<option value="">All categories</option>'+cats.sort().map(function(c){return '<option>'+esc(c)+'</option>';}).join(""); sel.value=cats.indexOf(cur)>=0?cur:"";
  var q=$("dSearch").value.trim().toLowerCase();
  var list=designs.filter(function(d){ return (!sel.value||d["Category"]===sel.value)&&(!q||(String(d["Design name"])+" "+String(d["Category"]||"")).toLowerCase().indexOf(q)>=0); });
  $("dCount").textContent=designs.length?(list.length+" of "+designs.length+" designs"):"No designs yet. Run the DST tool with --sync to add your designs.";
  var g=$("designGrid"); g.innerHTML="";
  list.slice(0,dShown).forEach(function(d){
    var c=el("div","dcard"), t=thumb(d["Preview link (Drive)"]), p=suggested(d);
    c.innerHTML='<div class="pic">'+(t?'<img loading="lazy" alt="" src="'+esc(t)+'">':'No preview')+'</div><div class="meta"><div class="nm">'+esc(d["Design name"])+'</div>'+
      '<div class="sub">'+Number(d["Stitch count"]||0).toLocaleString("en-IN")+' stitches'+(d["Width mm"]?' · '+Math.round(d["Width mm"]/10)+'×'+Math.round(d["Height mm"]/10)+' cm':'')+'</div>'+(p?'<div class="price">₹ '+money(p)+'</div>':'')+'</div>';
    var im=c.querySelector("img"); if(im) im.addEventListener("error",function(){ im.parentNode.textContent="No preview"; });
    var b=el("button","btn small gold","Use in invoice"); b.type="button"; b.style.margin="0 10px 10px"; b.addEventListener("click",function(){ useDesign(d); }); c.appendChild(b); g.appendChild(c);
  });
  $("dMore").hidden=list.length<=dShown;
}
$("dSearch").addEventListener("input",function(){ renderDesigns(true); });
$("dCat").addEventListener("change",function(){ renderDesigns(true); });
$("dMore").addEventListener("click",function(){ dShown+=D_PAGE; renderDesigns(false); });
$("browseDesigns").addEventListener("click",function(e){ e.preventDefault(); show("designs"); });
function useDesign(d,qty,extra){
  if(lockedNo) newInvoice();
  var q=designQuote(d,qty||1,extra||0);
  $("fDesign").value=d["Design name"]; $("fStitch").value=d["Stitch count"]||"";
  var row={desc:d["Design name"]+" – embroidery",qty:q.qty,rate:q.per,designId:d["Design ID"]||"",stitches:d["Stitch count"]||""};
  var fresh=items.length===1&&!String(items[0].desc||"").trim()&&!num(items[0].rate);
  items=fresh?[row]:items.concat([row]);
  if(q.job>0) items.push({desc:"Job setup",qty:1,rate:q.job});
  renderItemRows(); render(); show("invoice"); window.scrollTo({top:0,behavior:"smooth"}); toast("Added "+d["Design name"]+" at ₹ "+money(q.per)+" each");
}
function showDesignHint(){
  var box=$("fDesignQuote"), d=findDesign($("fDesign").value);
  if(!d||lockedNo){ box.hidden=true; return; }
  var q=designQuote(d,1,0);
  box.hidden=false; box.innerHTML='<b>'+esc(d["Design name"])+'</b> · '+Number(d["Stitch count"]||0).toLocaleString("en-IN")+' stitches · ~'+hm(q.minutes)+' → <b>₹ '+money(q.per)+'</b> each <button type="button" class="btn small gold" id="hintAdd">Add line</button>';
  $("hintAdd").addEventListener("click",function(){ useDesign(d,1,0); });
}
$("fDesign").addEventListener("input",showDesignHint);
$("fDesign").addEventListener("change",function(){
  var m=findDesign($("fDesign").value);
  if(m&&!$("fStitch").value){ $("fStitch").value=m["Stitch count"]||""; render(); }
  showDesignHint();
});

/* ---- blouse (multi-part) quote ---- */
var partSel={};   // design name -> {on,qty}
function baseOf(n){ return String(n||"").trim().split(/\s+/)[0]; }
function partOf(n){ return String(n||"").trim().split(/\s+/).slice(1).join(" "); }
function partsFor(code){
  var c=normCode(code); if(!c) return null;
  var list=designs.filter(function(d){ var n=String(d["Design name"]||""); return /\s/.test(n.trim())&&normCode(baseOf(n))===c; });
  return list.length?list:null;
}
function defQty(label){ var l=label.toLowerCase(); if(/border|half/.test(l)) return 0; if(/hand/.test(l)) return 2; if(/^(back|front)$/.test(l)) return 1; return 0; }
function orderLabel(base,sel){ return base+" – "+sel.map(function(x){ return (x.qty>1?x.qty+" × ":"")+x.label; }).join(" + "); }
function renderParts(list,blouses,extra,code){
  var res=$("qResult"), box=$("qParts"); box.innerHTML="";
  var base=baseOf(list[0]["Design name"]);
  var rows=list.map(function(d){
    var n=d["Design name"], lab=partOf(n); if(!partSel[n]){ var q0=defQty(lab); partSel[n]={on:q0>0,qty:q0>0?q0:1}; }
    return {d:d,n:n,label:lab,st:num(d["Stitch count"]),col:num(d["Colour changes"]),s:partSel[n]};
  });
  var pan=el("div","panel parts"); pan.innerHTML='<div class="eyebrow">Parts of the blouse</div>';
  rows.forEach(function(r){
    var row=el("div","prow"+(r.s.on?" on":""));
    row.innerHTML='<label class="pchk"><input type="checkbox"'+(r.s.on?" checked":"")+'><span><b>'+esc(r.label||r.n)+'</b><small>'+r.st.toLocaleString("en-IN")+' stitches</small></span></label>'+
      '<span class="pstep"><button type="button" data-d="-1" aria-label="Fewer">−</button><output>'+r.s.qty+'</output><button type="button" data-d="1" aria-label="More">+</button></span>';
    row.querySelector("input").addEventListener("change",function(e){ r.s.on=e.target.checked; renderQuote(); });
    row.querySelectorAll(".pstep button").forEach(function(b){ b.addEventListener("click",function(){ r.s.qty=Math.max(1,Math.min(9,r.s.qty+Number(b.dataset.d))); r.s.on=true; renderQuote(); }); });
    pan.appendChild(row);
  });
  box.appendChild(pan);
  var sel=rows.filter(function(r){return r.s.on;});
  if(!sel.length){ res.innerHTML='<div class="panel"><p class="empty">Tick at least one part.</p></div>'; return; }
  var st=0,col=0,fr=0; sel.forEach(function(r){ st+=r.st*r.s.qty; col+=r.col*r.s.qty; fr+=r.s.qty; });
  var q=quote(st,col,blouses,extra,fr), label=orderLabel(base,sel.map(function(r){return {qty:r.s.qty,label:r.label};}));
  res.innerHTML='<div class="panel qcard"><div class="eyebrow">'+esc(label)+'</div><div class="qprice">₹ '+money(q.per).replace(/\.00$/,"")+'<small> per blouse</small></div>'+
    '<div class="qmeta">'+st.toLocaleString("en-IN")+' stitches · '+col+' colour change'+(col===1?"":"s")+' · '+fr+' frame'+(fr===1?"":"s")+' · about '+hm(q.minutes)+' on the machine</div>'+
    '<div class="qrows"><div><span>Machine time ('+hm(q.minutes)+' × ₹ '+pp("hourly")+'/h)</span><span>₹ '+money(q.machine)+'</span></div>'+
    '<div><span>Handling ('+fr+' × ₹ '+pp("handling")+')</span><span>₹ '+money(q.handling)+'</span></div>'+
    (q.floor?'<div><span>Minimum order charge applies</span><span>₹ '+money(pp("min"))+'</span></div>':'')+
    (q.extra>0?'<div><span>Extra '+extra+'%</span><span>₹ '+money(q.extra)+'</span></div>':'')+
    (q.qty>1||q.job>0?'<div class="tot"><span>'+q.qty+' blouse'+(q.qty===1?"":"s")+(q.job>0?' + job setup ₹ '+money(q.job):'')+'</span><span>₹ '+money(q.total)+'</span></div>':'')+'</div>'+
    '<div class="actions" style="margin-top:12px"><button class="btn primary" id="qUse" type="button">Start invoice</button></div></div>';
  $("qUse").addEventListener("click",function(){
    if(lockedNo) newInvoice();
    items=[{desc:label+" embroidery",qty:q.qty,rate:q.per,stitches:st}]; if(q.job>0) items.push({desc:"Job setup",qty:1,rate:q.job});
    $("fDesign").value=base; $("fStitch").value=st; renderItemRows(); render(); show("invoice"); window.scrollTo({top:0,behavior:"smooth"});
  });
}
/* ---- quick quote ---- */
function renderQuote(){
  var code=$("qCode").value.trim(), qty=num($("qQty").value)||1, extra=num($("qExtra").value), res=$("qResult"), chips=$("qChips");
  $("qParts").innerHTML="";
  var pl=partsFor(code);
  if(pl){ chips.innerHTML=""; renderParts(pl,qty,extra,code); return; }
  var d=findDesign(code), st=null, col=0, label="";
  chips.innerHTML="";
  if(d){ st=num(d["Stitch count"]); col=num(d["Colour changes"]); label=d["Design name"]; }
  else if(num($("qSt").value)>0){ st=num($("qSt").value); col=num($("qCol").value); label="Custom design"; }
  if(!d&&code){   // suggestions while typing
    var c=normCode(code), seen={}, m=[]; designs.forEach(function(x){ var n=String(x["Design name"]), b=/\s/.test(n.trim())?baseOf(n):n; if(normCode(b).indexOf(c)===0&&!seen[b]&&m.length<8){ seen[b]=1; m.push(b); } });
    m.forEach(function(b0){ var b=el("button","chip pick",esc(b0)); b.type="button"; b.addEventListener("click",function(){ $("qCode").value=b0; renderQuote(); }); chips.appendChild(b); });
  }
  if(st==null){ res.innerHTML=code?'<div class="panel"><p class="empty">No design called “'+esc(code)+'” yet. Pick one of the suggestions, or enter the stitch count under “Design not in the catalog”.</p></div>':'<div class="panel"><p class="empty">Type a design code to see the price.</p></div>'; if(!code&&designs.length){ var ch=el("div","chips"); designs.slice(0,8).forEach(function(d){ var c=el("button","chip pick"); c.type="button"; c.textContent=d["Design name"]; c.onclick=function(){ $("qCode").value=d["Design name"]; renderQuote(); }; ch.appendChild(c); }); res.appendChild(ch); } return; }
  var q=quote(st,col,qty,extra);
  res.innerHTML='<div class="panel qcard"><div class="eyebrow">'+esc(label)+'</div><div class="qprice">₹ '+money(q.per).replace(/\.00$/,"")+'<small> per piece</small></div>'+
    '<div class="qmeta">'+st.toLocaleString("en-IN")+' stitches · '+col+' colour change'+(col===1?"":"s")+' · about '+hm(q.minutes)+' on the machine</div>'+
    '<div class="qrows"><div><span>Machine time ('+hm(q.minutes)+' × ₹ '+pp("hourly")+'/h)</span><span>₹ '+money(q.machine)+'</span></div>'+
    '<div><span>Handling</span><span>₹ '+money(q.handling)+'</span></div>'+
    (q.floor?'<div><span>Minimum charge applies</span><span>₹ '+money(pp("min"))+'</span></div>':'')+
    (q.extra>0?'<div><span>Extra '+extra+'%</span><span>₹ '+money(q.extra)+'</span></div>':'')+
    (q.qty>1||q.job>0?'<div class="tot"><span>'+q.qty+' piece'+(q.qty===1?"":"s")+(q.job>0?' + job setup ₹ '+money(q.job):'')+'</span><span>₹ '+money(q.total)+'</span></div>':'')+'</div>'+
    '<div class="actions" style="margin-top:12px"><button class="btn primary" id="qUse" type="button">'+(d?'Start invoice with this':'Start invoice')+'</button></div></div>';
  $("qUse").addEventListener("click",function(){
    if(d) useDesign(d,q.qty,extra);
    else { if(lockedNo) newInvoice(); items=[{desc:"Embroidery – "+st.toLocaleString("en-IN")+" stitches",qty:q.qty,rate:q.per}]; if(q.job>0) items.push({desc:"Job setup",qty:1,rate:q.job}); $("fStitch").value=st; renderItemRows(); render(); show("invoice"); }
  });
}
["qCode","qQty","qExtra","qSt","qCol"].forEach(function(id){ $(id).addEventListener("input",renderQuote); });

/* ---- rates ---- */
function renderRates(){
  var box=$("rateRows"); box.innerHTML="";
  rates.forEach(function(r){ addRateRow(r["Item"],r["Default rate (Rs)"],r["Unit"]); });
  if(!rates.length) addRateRow("","","per piece");
  var map={pHourly:"hourly",pSpm:"spm",pCc:"cc",pHandling:"handling",pMin:"min",pJob:"job",pRound:"round"};
  Object.keys(map).forEach(function(id){ $(id).value=pp(map[id]); });
  renderTest();
}
function addRateRow(item,rate,unit){
  var row=el("div","rrow",'<input class="ri" placeholder="Item name" value="'+esc(item)+'"><input class="rr num" inputmode="decimal" placeholder="Rate ₹" value="'+esc(rate==null?"":rate)+'"><span style="display:flex;gap:4px"><button class="btn small primary" data-a="s" type="button">Save</button><button class="icon-btn" data-a="d" type="button" aria-label="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button></span>');
  var orig=item||"";
  row.querySelector('[data-a="s"]').addEventListener("click",async function(){
    var n=row.querySelector(".ri").value.trim(); if(!n){ toast("Enter an item name"); return; }
    try{ if(orig&&orig.toLowerCase()!==n.toLowerCase()) await api("deleteRate",{item:orig});
      await api("saveRate",{item:n,unit:unit||"per piece",rate:num(row.querySelector(".rr").value)}); orig=n; toast("Saved"); await loadBootstrap(); }catch(e){ toast("Not saved — "+e.message); }
  });
  row.querySelector('[data-a="d"]').addEventListener("click",async function(){
    if(!orig){ row.remove(); return; }
    try{ await api("deleteRate",{item:orig}); toast("Removed"); await loadBootstrap(); renderRates(); }catch(e){ toast("Could not remove — "+e.message); }
  });
  $("rateRows").appendChild(row);
}
$("btnAddRate").addEventListener("click",function(){ addRateRow("","","per piece"); });
var PMAP={pHourly:"hourly",pSpm:"spm",pCc:"cc",pHandling:"handling",pMin:"min",pJob:"job",pRound:"round"};
function renderTest(){
  var saved={}; Object.keys(PMAP).forEach(function(id){ var k=PK[PMAP[id]][0]; saved[k]=bset[k]; bset[k]=$(id).value===""?"":num($(id).value); });   // preview with what is typed, before saving
  var q=quote(num($("tSt").value),num($("tCol").value),1,0);
  Object.keys(saved).forEach(function(k){ bset[k]=saved[k]; });
  $("tOut").innerHTML='About <b>'+hm(q.minutes)+'</b> on the machine → machine charge ₹ '+money(q.machine)+' + handling ₹ '+money(q.handling)+(q.floor?' (minimum applies)':'')+' = <b>₹ '+money(q.per)+' per piece</b>';
}
Object.keys(PMAP).concat(["tSt","tCol"]).forEach(function(id){ $(id).addEventListener("input",renderTest); });
$("btnSavePricing").addEventListener("click",async function(){
  var b=$("btnSavePricing"); b.disabled=true; b.textContent="Saving…";
  try{
    for(var id in PMAP){ var k=PK[PMAP[id]][0], v=num($(id).value); await api("setSetting",{key:k,value:v}); bset[k]=v; }
    toast("Pricing saved"); await loadBootstrap(); renderTest(); renderQuote();
  }catch(e){ toast("Not saved — "+e.message); }
  finally{ b.disabled=false; b.textContent="Save pricing"; }
});

/* ---- reports ---- */
function kfmt(n){ return n>=100000?(n/100000).toFixed(1).replace(/\.0$/,"")+"L":n>=1000?(n/1000).toFixed(1).replace(/\.0$/,"")+"k":String(Math.round(n)); }
function renderReports(){
  var box=$("reportBox"), now=new Date(), today=todayStr(), ym=today.slice(0,7), y0=(now.getMonth()+1)>=4?now.getFullYear():now.getFullYear()-1;
  if(!history.length){ box.innerHTML='<div class="panel"><p class="empty">Reports appear once you have saved invoices.</p></div>'; return; }
  var total=function(h){return Number(h["Subtotal (Rs)"])||0;};
  var inFY=function(d){ d=String(d).slice(0,7); return d>=y0+"-04"&&d<=(y0+1)+"-03"; };
  var sum=function(arr,f){ return arr.reduce(function(s,x){return s+f(x);},0); };
  var fy=history.filter(function(h){return inFY(h["Date"]);});
  var coll=[]; history.forEach(function(h){ var adv=Number(h["Advance (Rs)"])||0; if(adv>0) coll.push({d:String(h["Date"]).slice(0,10),a:adv}); });
  payments.forEach(function(p){ coll.push({d:String(p["Date"]).slice(0,10),a:Number(p["Amount (Rs)"])||0}); });
  var mInv=history.filter(function(h){return String(h["Date"]).slice(0,7)===ym;});
  var months=[], names=["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"];
  for(var i=0;i<12;i++){ var mm=((i+3)%12)+1, yy=mm>=4?y0:y0+1, key=yy+"-"+pad(mm,2); months.push({k:key,n:names[i],v:sum(history.filter(function(h){return String(h["Date"]).slice(0,7)===key;}),total)}); }
  var max=Math.max.apply(null,months.map(function(m){return m.v;}))||1;
  var byC={}; fy.forEach(function(h){ var k=h["Customer name"]||"—"; byC[k]=(byC[k]||0)+total(h); });
  var top=Object.keys(byC).sort(function(a,b){return byC[b]-byC[a];}).slice(0,5);
  var fyLbl=pad(y0%100,2)+"-"+pad((y0+1)%100,2);
  box.innerHTML='<div class="cards">'+
    '<div class="stat"><div class="k">Today</div><div class="v">₹ '+money(sum(history.filter(function(h){return String(h["Date"]).slice(0,10)===today;}),total))+'</div><div class="s">invoiced</div></div>'+
    '<div class="stat"><div class="k">This month</div><div class="v">₹ '+money(sum(mInv,total))+'</div><div class="s">'+mInv.length+' invoice'+(mInv.length===1?"":"s")+'</div></div>'+
    '<div class="stat"><div class="k">Collected this month</div><div class="v">₹ '+money(sum(coll.filter(function(c){return c.d.slice(0,7)===ym;}),function(c){return c.a;}))+'</div><div class="s">advances + payments</div></div>'+
    '<div class="stat"><div class="k">Outstanding</div><div class="v">₹ '+money(sum(history,function(h){return Math.max(bal(h),0);}))+'</div><div class="s">all dues</div></div></div>'+
    '<div class="panel"><div class="eyebrow">FY '+fyLbl+'</div><h2>Invoiced by month</h2><p class="hint" style="margin:0">Total this year: <b>₹ '+money(sum(fy,total))+'</b> across '+fy.length+' invoices</p><div class="bars">'+
    months.map(function(m){ return '<div class="bar-col">'+(m.v?'<em>'+kfmt(m.v)+'</em>':'')+'<i style="height:'+(m.v?Math.max(m.v/max*100,4):0)+'%"></i><span>'+m.n+'</span></div>'; }).join("")+'</div></div>'+
    '<div class="panel"><h2>Top customers</h2>'+(top.length?top.map(function(n){return '<div class="rowline"><span>'+esc(n)+'</span><b>₹ '+money(byC[n])+'</b></div>';}).join(""):'<p class="empty">None yet.</p>')+
    '<div class="actions" style="margin-top:12px"><button class="btn small" id="btnCsv" type="button">Download invoices CSV</button></div></div>';
  $("btnCsv").addEventListener("click",function(){
    var cols=["Invoice no.","Date","Customer name","Subtotal (Rs)","Advance (Rs)","Paid so far (Rs)","Balance (Rs)","Status"];
    var csv=[cols.join(",")].concat(history.map(function(h){ return cols.map(function(c){ return '"'+String(h[c]==null?"":h[c]).replace(/"/g,'""')+'"'; }).join(","); })).join("\r\n");
    var a=document.createElement("a"); a.href=URL.createObjectURL(new Blob(["﻿"+csv],{type:"text/csv"})); a.download="tara-invoices-"+todayStr()+".csv"; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },3000);
  });
}
window.__renderMore=function(){ if($("v-designs").classList.contains("on")) renderDesigns(false); if($("v-customers").classList.contains("on")) renderCustomers(); if($("v-rates").classList.contains("on")) renderRates(); };

/* ---------- Start ---------- */
(function init(){
  var s=lsGet("td_settings"); if(s) settings=Object.assign({},DEFAULTS,s);
  fillSettings(); syncTheme(); setLocked(null);
  var dr=lsGet("td_draft"); fillForm(dr&&dr.items?dr:{date:todayStr()});
  if(document.fonts&&document.fonts.ready) document.fonts.ready.then(render);
  setSync(false,getCfg().token?"Connecting…":"Not connected — open Settings");
  show("quote",true);
  loadBootstrap().then(function(){ loadHistory(); });
})();
})();
