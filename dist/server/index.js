const DAILY_LIMIT = 280;
const STATE_KEY = "production";
const MAIL_FROM = "TuckQ TISB <tuckq@tisb.ac.in>";

async function ensureDb(env) {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS tuckq_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_tuckq_state_updated_at ON tuckq_state (updated_at)"),
  ]);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function handleApi(request, env) {
  if (!env.DB) return json({ ok: false, error: "Database binding is unavailable" }, 500);
  await ensureDb(env);
  if (request.method === "GET") {
    const row = await env.DB.prepare("SELECT value FROM tuckq_state WHERE key = ?").bind(STATE_KEY).first();
    return json({ ok: true, state: row ? JSON.parse(row.value) : null });
  }
  if (request.method === "POST") {
    const body = await request.json();
    await env.DB.prepare("INSERT INTO tuckq_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP")
      .bind(STATE_KEY, JSON.stringify(body.state ?? null))
      .run();
    return json({ ok: true });
  }
  return json({ ok: false, error: "Method not allowed" }, 405);
}

async function handleMail(request, env) {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const body = await request.json();
  const message = body.message || {};
  let status = "Draft";
  let providerId = "";
  let reason = "Mail provider not configured. Stored in TuckQ outbox.";

  if (env.RESEND_API_KEY && message.to) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: env.MAIL_FROM || MAIL_FROM,
        to: [message.to],
        subject: message.subject || "TuckQ notification",
        text: message.body || "",
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok) {
      status = "Sent";
      providerId = result.id || "";
      reason = "";
    } else {
      status = "Failed";
      reason = result.message || "Mail provider rejected the message.";
    }
  }

  if (env.DB) {
    await ensureDb(env);
    const row = await env.DB.prepare("SELECT value FROM tuckq_state WHERE key = ?").bind(STATE_KEY).first();
    const state = row ? JSON.parse(row.value) : {};
    state.mailOutbox = Array.isArray(state.mailOutbox) ? state.mailOutbox : [];
    const existing = state.mailOutbox.find((mail) => mail.id === message.id);
    const record = { ...message, status, providerId, reason, sentAt: new Date().toISOString() };
    if (existing) Object.assign(existing, record);
    else state.mailOutbox.unshift(record);
    await env.DB.prepare("INSERT INTO tuckq_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP")
      .bind(STATE_KEY, JSON.stringify(state))
      .run();
  }

  return json({ ok: true, status, providerId, reason });
}

async function handleAsset(request) {
  const url = new URL(request.url);
  if (url.pathname === "/asset/logo.png") {
    try {
      const response = await fetch("https://www.tisb.org/assets/img/logo.png", {
        headers: { "user-agent": "TuckQ/1.0" },
      });
      if (response.ok) {
        return new Response(response.body, {
          headers: {
            "content-type": response.headers.get("content-type") || "image/png",
            "cache-control": "public, max-age=86400",
          },
        });
      }
    } catch {}
    const fallback = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" rx="18" fill="#fff"/><path d="M80 18l47 15v37c0 30-18 55-47 72-29-17-47-42-47-72V33l47-15z" fill="#23235f"/><path d="M48 102c18 14 46 14 64 0" fill="none" stroke="#bf835e" stroke-width="8" stroke-linecap="round"/><text x="80" y="74" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="800" fill="#fff">TISB</text><circle cx="80" cy="38" r="10" fill="#bf835e"/></svg>`;
    return new Response(fallback, {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": "public, max-age=86400",
      },
    });
  }
  return new Response("Not found", { status: 404 });
}

function html() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TuckQ | TISB Tuck Shop</title>
  <style>
    :root{--ink:#18213a;--muted:#66708a;--line:#dbe1ed;--paper:#fff;--wash:#f5f7fb;--navy:#23235f;--navy2:#171943;--gold:#bf835e;--green:#24785f;--yellow:#d59821;--red:#b94545;--blue:#3765aa;--shadow:0 18px 50px rgb(24 33 58 / 12%);--soft:0 10px 24px rgb(24 33 58 / 8%)}
    *{box-sizing:border-box} body{margin:0;background:var(--wash);color:var(--ink);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0} button,input,select,textarea{font:inherit} button{border:0;cursor:pointer;border-radius:8px;min-height:42px;transition:.15s ease} button:hover{transform:translateY(-1px);box-shadow:0 10px 24px rgb(20 33 61 / 10%)} button:disabled{opacity:.5;cursor:not-allowed;transform:none;box-shadow:none} input,select,textarea{width:100%;min-width:0;border:1px solid var(--line);border-radius:8px;background:#fff;padding:12px 13px;color:var(--ink);outline:none} textarea{min-height:178px;resize:vertical} label{display:grid;gap:7px;color:var(--muted);font-size:13px;font-weight:760}
    .screen{display:none;min-height:100dvh}.screen.active{display:grid}.home{color:#fff;align-items:center;padding:28px;background:linear-gradient(110deg,rgb(23 25 67 / 95%),rgb(35 35 95 / 78%)),linear-gradient(135deg,#171943,#4a4c86);background-size:cover;background-position:center}.landingInner{width:min(1120px,100%);margin:0 auto;display:grid;gap:34px}.brandRow{display:flex;align-items:center;justify-content:space-between;gap:14px}.brand{display:inline-grid;grid-template-columns:62px minmax(0,1fr);gap:12px;align-items:center;max-width:min(520px,100%)}.brand img{width:62px;height:62px;object-fit:contain;border-radius:8px;background:#fff;padding:5px}.brand b{display:block;font-size:22px;line-height:1.05;white-space:normal;overflow-wrap:anywhere}.brand span{display:block;margin-top:4px;color:#e4c9b5;font-size:12px;font-weight:760;line-height:1.3}.topLogin{background:#fff;color:var(--navy);padding:0 22px;font-size:18px;font-weight:900;box-shadow:var(--shadow)}.heroGrid{display:grid;gap:26px}.heroCopy{max-width:760px;padding:62px 0 12px}.heroCopy h1{margin:0;font-size:clamp(42px,8vw,92px);line-height:.92;max-width:760px}.heroCopy p:not(.eyebrow){max-width:680px;margin:20px 0 0;font-size:18px;line-height:1.55;color:#eef1ff}.eyebrow{margin:0 0 12px;color:#e4c9b5;text-transform:uppercase;font-weight:850;font-size:12px;letter-spacing:.08em}.portalGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;max-width:980px}.portalCard{min-height:172px;display:grid;align-content:space-between;gap:14px;text-align:left;padding:18px;border:1px solid rgb(255 255 255 / 24%);background:rgb(255 255 255 / 12%);border-radius:8px;color:#fff;backdrop-filter:blur(12px)}.portalCard strong{display:block;font-size:22px;margin-bottom:8px}.portalCard span{display:block;color:#e7eaf8;font-size:13px;line-height:1.45}.portalIcon{width:44px;height:44px;border-radius:8px;display:grid;place-items:center;background:rgb(255 255 255 / 18%);font-weight:950}.landingStats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;max-width:760px}.landingStat{border:1px solid rgb(255 255 255 / 24%);background:rgb(255 255 255 / 11%);border-radius:8px;padding:16px;backdrop-filter:blur(12px)}.landingStat b{display:block;font-size:28px}.landingStat span{color:#d6daee;font-size:13px}
    .loginPage{place-items:center;padding:24px;background:linear-gradient(120deg,rgb(244 246 251 / 98%),rgb(255 255 255 / 94%))}.loginPanel{width:min(460px,100%);display:grid;gap:18px;background:#fff;border:1px solid var(--line);border-radius:8px;padding:24px;box-shadow:var(--shadow)}.loginHead{display:grid;grid-template-columns:58px 1fr;gap:12px;align-items:center}.loginHead img{width:58px;height:58px;object-fit:contain;border-radius:8px;border:1px solid var(--line);padding:4px;background:#fff}.loginPanel h2{margin:0;font-size:24px;line-height:1.15}.loginPanel .eyebrow{color:var(--gold);margin:0}.primary{background:var(--navy);color:#fff;padding:0 16px;font-weight:850}.ghost,.textBtn{background:#eef3fb;color:var(--navy);padding:0 14px;font-weight:800}.textBtn{justify-self:start;min-height:34px}
    .app{grid-template-rows:auto auto 1fr}.appTop{position:sticky;top:0;z-index:10;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:16px;padding:14px clamp(14px,3vw,28px);border-bottom:1px solid var(--line);background:rgb(255 255 255 / 94%);backdrop-filter:blur(12px)}.brand.compact{grid-template-columns:48px minmax(0,1fr);min-width:160px}.brand.compact img{width:48px;height:48px;padding:5px;border:1px solid var(--line)}.brand.compact b{color:var(--navy);font-size:24px}.brand.compact span{color:var(--muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}nav{display:flex;gap:8px;overflow-x:auto;padding:4px}nav button{min-width:86px;background:#eef3fb;color:var(--navy);padding:0 12px;text-transform:capitalize;font-weight:820}nav button.active{background:var(--navy);color:#fff}.topActions{display:flex;align-items:center;gap:8px}.bell{position:relative;width:44px;background:#fff6e9;color:var(--navy)}.bell span{position:absolute;top:-5px;right:-5px;min-width:20px;height:20px;display:grid;place-items:center;border-radius:999px;background:var(--red);color:#fff;font-size:11px}.noticePanel{display:none;position:absolute;right:24px;top:76px;width:min(390px,calc(100vw - 28px));max-height:70vh;overflow:auto;padding:16px;border:1px solid var(--line);border-radius:8px;background:#fff;box-shadow:var(--shadow)}.noticePanel.open{display:block}.noticePanel h3{margin:0 0 12px}.notice{display:grid;gap:4px;padding:12px 0;border-top:1px solid #edf1f6}.notice span{color:var(--muted);line-height:1.35}.notice small{color:var(--gold);font-weight:780}.toast{margin:16px clamp(14px,3vw,28px) 0;padding:12px 14px;border:1px solid #d9e7f5;border-radius:8px;background:#f8fbff;color:var(--muted);font-weight:750}
    .grid{width:min(1440px,100%);margin:0 auto;padding:clamp(14px,3vw,28px);display:grid;gap:16px}.two{grid-template-columns:repeat(2,minmax(0,1fr))}.posGrid{grid-template-columns:minmax(0,1.35fr) minmax(320px,.65fr)}.adminGrid{grid-template-columns:repeat(4,minmax(0,1fr))}.panel{min-width:0;display:grid;align-content:start;gap:16px;padding:18px;border:1px solid var(--line);border-radius:8px;background:var(--paper);box-shadow:0 8px 26px rgb(20 33 61 / 6%)}.panel header{display:flex;gap:12px;align-items:center;justify-content:space-between}.panel h2,.panel h3{margin:0;line-height:1.15}.panel header span{flex:none;border-radius:999px;background:#f2f5fb;color:var(--navy);padding:7px 10px;font-size:12px;font-weight:850}.slotGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px}.slot{display:grid;gap:5px;padding:13px;background:#f8fafc;color:var(--ink);border:1px solid var(--line);text-align:left}.slot.selected{background:#fff5ea;border-color:#e6b575}.slot span,.muted{color:var(--muted)}.metricRow{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.metric{display:grid;gap:3px;padding:14px;border:1px solid var(--line);border-radius:8px;background:#fafcff}.metric b{font-size:22px;line-height:1.1;overflow-wrap:anywhere}.metric span{color:var(--muted);font-size:12px;font-weight:760}.miniList,.items,.reportGrid,.formStack{display:grid;gap:10px}.miniList span{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid #edf1f6}.formRow{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.items{grid-template-columns:repeat(auto-fill,minmax(180px,1fr));max-height:520px;overflow:auto}.items button{min-height:92px;text-align:left;padding:13px;background:#f8fafc;border:1px solid var(--line)}.items span{display:block;margin-top:6px;color:var(--muted);font-size:13px;line-height:1.35}.cartLine{display:grid;grid-template-columns:minmax(0,1fr) auto 36px 36px;gap:8px;align-items:center;padding:10px 0;border-top:1px solid #edf1f6}.cartLine span{overflow-wrap:anywhere}.cartLine button{min-height:34px;background:#eef3fb;color:var(--navy);font-weight:900}.receipt{display:grid;gap:8px;padding:14px;border:1px dashed #aab6c8;border-radius:8px;background:#fcfcfd;font-family:ui-monospace,Menlo,monospace;font-size:12px}.receipt div{display:flex;justify-content:space-between;gap:10px}.actions{display:flex;flex-wrap:wrap;gap:10px}.actions button,.reportGrid button{background:#eef3fb;color:var(--navy);padding:0 14px;font-weight:820}table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:12px 10px;border-bottom:1px solid #edf1f6;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{color:var(--muted);font-size:12px;text-transform:uppercase}
    @media(max-width:980px){.two,.posGrid,.adminGrid,.portalGrid{grid-template-columns:1fr}.heroCopy{padding-top:36px}.appTop{grid-template-columns:1fr auto}.appTop nav{grid-column:1/-1;order:3}}@media(max-width:620px){.home{align-items:start}.landingInner{gap:20px}.brandRow{align-items:flex-start}.brand{grid-template-columns:58px minmax(0,1fr)}.brand img{width:58px;height:58px}.brand b{font-size:24px}.topLogin{padding:0 12px;font-size:14px;min-height:38px}.heroCopy{padding-top:18px}.heroCopy h1{font-size:clamp(42px,14vw,66px)}.landingStats,.formRow,.metricRow{grid-template-columns:1fr}.topActions .ghost{display:none}.panel header{align-items:flex-start;flex-direction:column}.cartLine{grid-template-columns:minmax(0,1fr) auto}.cartLine button{width:100%}}@media print{body *{visibility:hidden}.receipt,.receipt *{visibility:visible}.receipt{position:fixed;inset:20px auto auto 20px;width:320px}}
  </style>
</head>
<body>
  <section id="home" class="screen home active">
    <div class="landingInner">
    <header class="brandRow"><div class="brand"><img src="/asset/logo.png" alt="TISB crest"><div><b>TuckQ</b><span>The International School Bangalore</span></div></div><button class="topLogin" data-open-login="student">Student Login</button></header>
    <div class="heroGrid">
      <section class="heroCopy"><p class="eyebrow">TISB Tuck Shop</p><h1>TuckQ Operating System</h1><p>Separate portals for students, POS billing, queue operators, and school admins. Book slots, scan cards, print bills, manage accounts, and download reports from one polished system.</p></section>
      <section class="landingStats"><div class="landingStat"><b>₹280</b><span>daily tuck shop purchase limit</span></div><div class="landingStat"><b>3:45-4:45</b><span>pre-booking slots</span></div><div class="landingStat"><b>D1</b><span>hosted database records</span></div></section>
      <section class="portalGrid">
        <button class="portalCard" data-open-login="student"><div class="portalIcon">ST</div><div><strong>Student Portal</strong><span>Book 3:45-4:45 slots, cancel bookings, join the queue, and see daily, weekly, and monthly billing.</span></div></button>
        <button class="portalCard" data-open-login="operator"><div class="portalIcon">₹</div><div><strong>POS Portal</strong><span>Scan a student card, add day-wise items, charge the student account, and print a proper bill.</span></div></button>
        <button class="portalCard" data-open-login="admin"><div class="portalIcon">AD</div><div><strong>School Admin</strong><span>Create student logins, import ID cards, manage menu items, check mail events, and download reports.</span></div></button>
      </section>
    </div>
    </div>
  </section>
  <section id="login" class="screen loginPage"><div class="loginPanel"><button class="textBtn" id="backHome">Back</button><div class="loginHead"><img src="/asset/logo.png" alt="TISB crest"><div><p class="eyebrow" id="loginRoleText">Student Login</p><h2 id="loginCopy">Book slots and check account billing.</h2></div></div><label>ID card / user ID<input id="loginId"></label><label>Password<input id="loginPassword" type="password"></label><button class="primary" id="loginBtn">Login to TuckQ</button></div></section>
  <section id="app" class="screen app">
    <header class="appTop"><div class="brand compact"><img src="/asset/logo.png" alt="TISB crest"><div><b>TuckQ</b><span id="userLine">TISB</span></div></div><nav id="nav"></nav><div class="topActions"><button class="bell" id="bell">🔔<span id="unread">0</span></button><button class="ghost" id="logout">Logout</button></div><aside class="noticePanel" id="noticePanel"><h3>Notifications</h3><div id="notices"></div></aside></header>
    <p class="toast" id="toast">Ready</p>
    <section id="view"></section>
  </section>
  <script>
    const DAILY_LIMIT = ${DAILY_LIMIT};
    const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    const starter = {user:null,open:false,paused:false,batch:5,slotIncrement:10,slotCapacity:18,nextNumber:36,served:214,bookings:[],queue:[],students:[{id:"TISB1042",name:"Aarav Nair",className:"Grade 9 - Nile",email:"tisb1042@tisb.ac.in",password:"student1042",accountLimit:2500,status:"active"},{id:"TISB1043",name:"Diya Sharma",className:"Grade 8 - Cauvery",email:"tisb1043@tisb.ac.in",password:"student1043",accountLimit:2500,status:"active"}],catalogue:[{id:"chips-classic",day:"Everyday",name:"Chips",category:"Daily chips",price:30,stock:100},{id:"chips-masala",day:"Everyday",name:"Masala Chips",category:"Daily chips",price:35,stock:90},{id:"daily-lemon",day:"Everyday",name:"Lemon Juice",category:"Drink",price:45,stock:75},{id:"daily-popcorn",day:"Everyday",name:"Popcorn",category:"Snack",price:50,stock:70},{id:"mon-toast",day:"Monday",name:"Chicken Cheese Toast",category:"Hot food",price:95,stock:35},{id:"mon-samosa",day:"Monday",name:"Samosa Chat",category:"Snack",price:70,stock:45},{id:"tue-noodles-veg",day:"Tuesday",name:"Chinese Veg Noodles",category:"Hot food",price:90,stock:40},{id:"tue-noodles-chicken",day:"Tuesday",name:"Chinese Chicken Noodles",category:"Hot food",price:115,stock:35},{id:"wed-roll",day:"Wednesday",name:"Paneer Khatti Roll",category:"Hot food",price:105,stock:40},{id:"thu-rice",day:"Thursday",name:"Chicken Fried Rice",category:"Hot food",price:115,stock:35},{id:"fri-paneer",day:"Friday",name:"Malai Paneer Tikka",category:"Hot food",price:115,stock:35},{id:"sat-fries",day:"Saturday",name:"French Fries",category:"Snack",price:75,stock:50},{id:"sun-tikka",day:"Sunday",name:"Afghani Chicken Tikka",category:"Hot food",price:135,stock:30}],selectedPosDay:new Date().toLocaleDateString("en-US",{weekday:"long"}),cart:[],sales:[],mailOutbox:[],notices:[{id:"N-1",title:"Welcome to TuckQ",body:"Bookings are open before 3:45 PM.",time:"Today",type:"system"}],lastReceipt:null};
    let state = starter, role = "student", view = "student", saveTimer;
    const $ = id => document.getElementById(id);
    const money = n => "₹" + Math.max(0, Number(n)||0).toLocaleString("en-IN");
    const today = () => new Date().toISOString().slice(0,10);
    const saleTotal = sale => sale.items.reduce((s,i)=>s+i.price*i.qty,0);
    const student = () => state.user?.role === "student" ? state.students.find(s=>s.id===state.user.id) : null;
    const dayItems = () => state.catalogue.filter(i=>i.day==="Everyday"||i.day===state.selectedPosDay);
    const dailySpend = id => state.sales.filter(s=>s.studentId===id&&s.date===today()).reduce((sum,s)=>sum+saleTotal(s),0);
    const monthlySpend = id => state.sales.filter(s=>s.studentId===id&&s.date.startsWith(today().slice(0,7))).reduce((sum,s)=>sum+saleTotal(s),0);
    const weeklySpend = id => {const now=new Date(),start=new Date(now);start.setDate(now.getDate()-now.getDay());start.setHours(0,0,0,0);return state.sales.filter(s=>s.studentId===id&&new Date(s.date)>=start).reduce((sum,s)=>sum+saleTotal(s),0)};
    function show(id){document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));$(id).classList.add("active")}
    function toast(text){$("toast").textContent=text}
    function save(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>fetch("/api/tuckq",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({state})}).catch(()=>{}),250)}
    function render(){if(!state.user)return;$("userLine").textContent=state.user.name;const allowed=state.user.role==="admin"?["admin","pos","operator","account","import"]:state.user.role==="operator"?["pos","operator"]:["student","account"];$("nav").innerHTML=allowed.map(v=>'<button class="'+(v===view?'active':'')+'" data-view="'+v+'">'+v+'</button>').join("");document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{view=b.dataset.view;render()});$("unread").textContent=state.notices.filter(n=>!n.read).length;$("notices").innerHTML=state.notices.slice(0,8).map(n=>'<div class="notice"><b>'+n.title+'</b><span>'+n.body+'</span><small>'+n.time+'</small></div>').join("");$("view").innerHTML=views[view]();bindView();save()}
    function notify(title,body,type="notice"){state.notices.unshift({id:"N-"+Date.now(),title,body,time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),type});toast(title)}
    function queueMail(person,subject,body,type="notice"){if(!person||!person.email)return;state.mailOutbox=Array.isArray(state.mailOutbox)?state.mailOutbox:[];const mail={id:"MAIL-"+Date.now()+"-"+Math.random().toString(16).slice(2,6),to:person.email,studentId:person.id,studentName:person.name,subject,body,type,date:today(),time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),status:"Queued"};state.mailOutbox.unshift(mail);fetch("/api/mail",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message:mail})}).then(r=>r.json()).then(result=>{mail.status=result.status||mail.status;mail.reason=result.reason||"";save();render()}).catch(()=>{mail.status="Failed";save()})}
    function slots(){let out=[];for(let t=945;t<1005;t+=state.slotIncrement){out.push(fmt(t)+"-"+fmt(Math.min(1005,t+state.slotIncrement)))}return out}
    function fmt(total){let h=Math.floor(total/60),m=total%60;return ((h+11)%12+1)+":"+String(m).padStart(2,"0")}
    function table(head,rows){return '<table><thead><tr>'+head.map(h=>'<th>'+h+'</th>').join("")+'</tr></thead><tbody>'+(rows.length?rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join("")+'</tr>').join(""):'<tr><td colspan="'+head.length+'">No records yet.</td></tr>')+'</tbody></table>'}
    function panel(title,badge,body){return '<section class="panel"><header><h2>'+title+'</h2><span>'+badge+'</span></header>'+body+'</section>'}
    const views = {
      student(){const s=student();return '<section class="grid two">'+panel("Book a slot","3:45-4:45 PM",'<div class="slotGrid">'+slots().map(slot=>{const mine=state.bookings.find(b=>b.studentId===s.id&&b.slot===slot&&b.status==="Booked");const filled=state.bookings.filter(b=>b.slot===slot&&b.status==="Booked").length;return '<button class="slot '+(mine?'selected':'')+'" data-slot="'+slot+'"><b>'+slot+'</b><span>'+(mine?'Cancel booking':(state.slotCapacity-filled)+" left")+'</span></button>'}).join("")+'</div>')+panel("Live queue",state.open?"Open":"Pre-booking",'<div class="metricRow"><div class="metric"><b>'+state.queue.filter(q=>q.status==="WAITING").length+'</b><span>Waiting</span></div><div class="metric"><b>'+state.queue.filter(q=>q.status==="CALLED").length+'</b><span>Called</span></div><div class="metric"><b>'+state.served+'</b><span>Served</span></div></div><button class="primary" id="joinQueue" '+(!state.open||state.paused?'disabled':'')+'>Join live queue</button><h3>Today\\'s menu</h3><div class="miniList">'+dayItems().slice(0,8).map(i=>'<span>'+i.name+' <b>'+money(i.price)+'</b></span>').join("")+'</div>')+'</section>'},
      pos(){return '<section class="grid posGrid">'+panel("Billing",money(DAILY_LIMIT)+" daily cap",'<div class="formRow"><input id="posId" placeholder="Scan ID card" value="TISB1042"><input id="posName" placeholder="Student name if new"></div><div class="formRow"><select id="posDay">'+DAYS.map(d=>'<option '+(d===state.selectedPosDay?'selected':'')+'>'+d+'</option>').join("")+'</select><input id="search" placeholder="Search items"></div><div class="items" id="items">'+dayItems().map(i=>'<button data-item="'+i.id+'"><b>'+i.name+'</b><span>'+i.category+' · '+money(i.price)+' · '+i.stock+' left</span></button>').join("")+'</div>')+panel("Bill",money(state.cart.reduce((s,i)=>s+i.price*i.qty,0)),'<div id="cart">'+(state.cart.length?state.cart.map(i=>'<div class="cartLine"><span>'+i.qty+' x '+i.name+'</span><b>'+money(i.qty*i.price)+'</b><button data-dec="'+i.id+'">-</button><button data-inc="'+i.id+'">+</button></div>').join(""):'<p class="muted">Cart is empty.</p>')+'</div><button class="primary" id="checkout">Charge student account</button><button class="ghost" onclick="print()">Print bill</button><div class="receipt">'+(state.lastReceipt?'<h3>TISB Tuck Shop</h3><p>'+state.lastReceipt.billNo+'</p>'+state.lastReceipt.items.map(i=>'<div>'+i.qty+' x '+i.name+'<b>'+money(i.qty*i.price)+'</b></div>').join("")+'<strong>Total '+money(saleTotal(state.lastReceipt))+'</strong>':'Receipt appears after checkout.')+'</div>')+'</section>'},
      operator(){return '<section class="grid two">'+panel("Queue controls",state.open?"Open":"Closed",'<div class="actions"><button class="primary" id="toggleOpen">'+(state.open?'Close':'Open')+' tuck shop</button><button id="pause">'+(state.paused?'Resume':'Pause')+'</button><button id="call">Call next '+state.batch+'</button><button id="serve">Serve</button><button id="noshow">No show</button></div>')+panel("Queue board",state.queue.length+" tickets",table(["No","Student","Status"],state.queue.slice(0,12).map(q=>["#"+q.number,q.name,q.status])))+'</section>'},
      account(){const s=student();return '<section class="grid two">'+panel("Student account",s?s.id:"All",'<div class="metricRow"><div class="metric"><b>'+money(s?dailySpend(s.id):0)+'</b><span>Today</span></div><div class="metric"><b>'+money(s?weeklySpend(s.id):0)+'</b><span>This week</span></div><div class="metric"><b>'+money(s?monthlySpend(s.id):0)+'</b><span>This month</span></div></div><p class="muted">'+(s?money(DAILY_LIMIT-dailySpend(s.id))+" left today":"₹280 daily limit")+'</p>')+panel("Recent bills",state.sales.length+" bills",table(["Bill","Student","Total"],state.sales.slice(-10).reverse().map(s=>[s.billNo,s.studentName,money(saleTotal(s))])))+'</section>'},
      import(){return '<section class="grid two">'+panel("Import students","ID, Name",'<textarea id="importText" placeholder="TISB2001, Student Name, Grade 8"></textarea><button class="primary" id="importBtn">Import roster</button>')+panel("Roster",state.students.length+" students",table(["ID","Name","Class"],state.students.slice(0,14).map(s=>[s.id,s.name,s.className])))+'</section>'},
      admin(){return '<section class="grid adminGrid">'+panel("Create student login","ID + password",'<div class="formStack"><input id="newId" placeholder="ID card number"><input id="newName" placeholder="Student name"><input id="newClass" placeholder="Class / House"><input id="newEmail" placeholder="Email"><input id="newPass" placeholder="Password"><button class="primary" id="createStudent">Save login</button></div>')+panel("Settings","TuckQ",'<div class="formStack"><label>Slot increment<select id="slotInc"><option value="5" '+(state.slotIncrement===5?'selected':'')+'>5 minutes</option><option value="10" '+(state.slotIncrement===10?'selected':'')+'>10 minutes</option></select></label><label>Slot capacity<input id="slotCap" type="number" value="'+state.slotCapacity+'"></label><label>Batch size<input id="batch" type="number" value="'+state.batch+'"></label></div>')+panel("Reports","CSV downloads",'<div class="reportGrid"><button data-report="sales">Sales report</button><button data-report="ledger">Ledger report</button><button data-report="inventory">Inventory report</button><button data-report="queue">Bookings report</button><button data-report="mail">Mail report</button></div>')+panel("Add POS item","Day-wise",'<div class="formStack"><input id="itemName" placeholder="Item name"><input id="itemPrice" placeholder="Price" value="40"><select id="itemDay"><option>Everyday</option>'+DAYS.map(d=>'<option>'+d+'</option>').join("")+'</select><button class="primary" id="addItem">Add item</button></div>')+panel("Auto mail outbox",(state.mailOutbox||[]).length+" events",table(["To","Subject","Status"],(state.mailOutbox||[]).slice(0,8).map(m=>[m.to,m.subject,m.status])))+'</section>'}
    };
    function bindView(){document.querySelectorAll("[data-slot]").forEach(b=>b.onclick=()=>{const s=student(),slot=b.dataset.slot,mine=state.bookings.find(x=>x.studentId===s.id&&x.slot===slot&&x.status==="Booked");if(mine){mine.status="Cancelled";notify("Booking cancelled","Your tuck shop slot has been released.","booking");queueMail(s,"TuckQ: Booking cancelled","Hi "+s.name+", your TISB tuck shop slot "+slot+" has been cancelled.","booking-cancel")}else if(state.bookings.some(x=>x.studentId===s.id&&x.status==="Booked"))toast("Cancel your current booking before choosing another slot.");else{state.bookings.unshift({id:"BK-"+Date.now(),studentId:s.id,studentName:s.name,slot,status:"Booked",createdAt:new Date().toISOString()});notify("Slot booked",slot+" is booked for "+s.name,"booking");queueMail(s,"TuckQ: Slot booked","Hi "+s.name+", your TISB tuck shop slot "+slot+" is confirmed.","booking")}render()});if($("joinQueue"))$("joinQueue").onclick=()=>{const s=student();state.queue.push({id:s.id,name:s.name,number:state.nextNumber++,status:"WAITING",joinedAt:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})});notify("Joined queue","Your queue ticket is ready.","queue");queueMail(s,"TuckQ: Queue ticket ready","Hi "+s.name+", you have joined the TISB tuck shop queue.","queue");render()};if($("toggleOpen"))$("toggleOpen").onclick=()=>{state.open=!state.open;render()};if($("pause"))$("pause").onclick=()=>{state.paused=!state.paused;render()};if($("call"))$("call").onclick=()=>{const called=state.queue.filter(q=>q.status==="WAITING").slice(0,state.batch);called.forEach(q=>{q.status="CALLED";const person=state.students.find(s=>s.id===q.id);queueMail(person,"TuckQ: Please come to the counter","Hi "+q.name+", your tuck shop turn has been called. Please come to the counter.","queue-call")});notify("Next batch called","Students have been called to the counter.","queue");render()};if($("serve"))$("serve").onclick=()=>{const q=state.queue.find(x=>x.status==="CALLED");if(q){q.status="SERVED";state.served++}render()};if($("noshow"))$("noshow").onclick=()=>{const q=state.queue.find(x=>x.status==="CALLED");if(q)q.status="NO SHOW";render()};document.querySelectorAll("[data-item]").forEach(b=>b.onclick=()=>{const i=state.catalogue.find(x=>x.id===b.dataset.item);const line=state.cart.find(x=>x.id===i.id);line?line.qty++:state.cart.push({id:i.id,name:i.name,price:i.price,qty:1});render()});document.querySelectorAll("[data-dec]").forEach(b=>b.onclick=()=>{const l=state.cart.find(x=>x.id===b.dataset.dec);if(l)l.qty--;state.cart=state.cart.filter(x=>x.qty>0);render()});document.querySelectorAll("[data-inc]").forEach(b=>b.onclick=()=>{const l=state.cart.find(x=>x.id===b.dataset.inc);if(l)l.qty++;render()});if($("posDay"))$("posDay").onchange=e=>{state.selectedPosDay=e.target.value;render()};if($("checkout"))$("checkout").onclick=checkout;if($("createStudent"))$("createStudent").onclick=createStudent;if($("slotInc"))$("slotInc").onchange=e=>{state.slotIncrement=Number(e.target.value);render()};if($("slotCap"))$("slotCap").onchange=e=>{state.slotCapacity=Number(e.target.value)||18;render()};if($("batch"))$("batch").onchange=e=>{state.batch=Number(e.target.value)||5;render()};if($("importBtn"))$("importBtn").onclick=importStudents;if($("addItem"))$("addItem").onclick=addItem;document.querySelectorAll("[data-report]").forEach(b=>b.onclick=()=>downloadReport(b.dataset.report))}
    function checkout(){const id=$("posId").value.trim().toUpperCase();let buyer=state.students.find(s=>s.id===id);if(!state.cart.length)return toast("Add items first.");if(!buyer&&$("posName").value.trim()){buyer={id,name:$("posName").value.trim(),className:"Unassigned",email:id.toLowerCase()+"@tisb.ac.in",password:"student"+id.slice(-4),accountLimit:2500,status:"active"};state.students.push(buyer)}if(!buyer)return toast("Scan ID and enter student name.");const cartTotal=state.cart.reduce((s,i)=>s+i.price*i.qty,0);if(cartTotal>DAILY_LIMIT-dailySpend(buyer.id))return toast("Daily tuck shop limit exceeded. Remaining today: "+money(DAILY_LIMIT-dailySpend(buyer.id))+".");const sale={billNo:"TQ-"+today().replaceAll("-","")+"-"+String(state.sales.length+1).padStart(4,"0"),date:today(),time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),studentId:buyer.id,studentName:buyer.name,cashier:state.user.name,items:state.cart};state.cart.forEach(l=>{const stock=state.catalogue.find(i=>i.id===l.id);if(stock)stock.stock=Math.max(0,stock.stock-l.qty)});state.sales.push(sale);state.lastReceipt=sale;state.cart=[];queueMail(buyer,"TuckQ: Bill "+sale.billNo,"Hi "+buyer.name+", your TISB tuck shop account was charged "+money(saleTotal(sale))+". Items: "+sale.items.map(i=>i.qty+"x "+i.name).join(", ")+".","bill");notify("Bill created",buyer.name+" charged "+money(saleTotal(sale))+".","billing");render()}
    function createStudent(){const id=$("newId").value.trim().toUpperCase();if(!id||!$("newName").value.trim()||!$("newPass").value.trim())return toast("ID, name and password are required.");const rec={id,name:$("newName").value.trim(),className:$("newClass").value.trim()||"Unassigned",email:$("newEmail").value.trim()||id.toLowerCase()+"@tisb.ac.in",password:$("newPass").value.trim(),accountLimit:2500,status:"active"};const old=state.students.find(s=>s.id===id);old?Object.assign(old,rec):state.students.unshift(rec);toast("Student login saved.");render()}
    function importStudents(){($("importText").value||"").split(/\\n+/).map(l=>l.trim()).filter(Boolean).forEach(line=>{const [idRaw,name,className]=line.split(",").map(p=>p.trim());const id=idRaw.toUpperCase();if(id&&name&&!state.students.some(s=>s.id===id))state.students.push({id,name,className:className||"Unassigned",email:id.toLowerCase()+"@tisb.ac.in",password:"student"+id.slice(-4),accountLimit:2500,status:"active"})});toast("Student import complete.");render()}
    function addItem(){if(!$("itemName").value.trim())return toast("Enter item name.");state.catalogue.unshift({id:"item-"+Date.now(),day:$("itemDay").value,name:$("itemName").value.trim(),category:"Snack",price:Number($("itemPrice").value)||40,stock:40});toast("Menu item added.");render()}
    function downloadReport(kind){let rows=kind==="sales"?[["bill_no","date","student_id","student","items","total"],...state.sales.map(s=>[s.billNo,s.date,s.studentId,s.studentName,s.items.map(i=>i.qty+"x "+i.name).join("; "),saleTotal(s)])]:kind==="ledger"?[["student_id","name","daily_spend","weekly_spend","monthly_spend","daily_limit","monthly_limit"],...state.students.map(s=>[s.id,s.name,dailySpend(s.id),weeklySpend(s.id),monthlySpend(s.id),DAILY_LIMIT,s.accountLimit])]:kind==="inventory"?[["item","day","category","price","stock"],...state.catalogue.map(i=>[i.name,i.day,i.category,i.price,i.stock])]:kind==="mail"?[["to","student_id","subject","type","status","reason","date","time"],...(state.mailOutbox||[]).map(m=>[m.to,m.studentId,m.subject,m.type,m.status,m.reason||"",m.date,m.time])]:[["student_id","name","slot","status"],...state.bookings.map(b=>[b.studentId,b.studentName,b.slot,b.status])];const csv=rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(",")).join("\\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="tuckq-"+kind+"-"+today()+".csv";a.click();URL.revokeObjectURL(a.href)}
    document.querySelectorAll("[data-open-login]").forEach(b=>b.onclick=()=>{role=b.dataset.openLogin;const map={student:["Student Login","Book slots and check account billing.","TISB1042","student1042"],operator:["Operator Login","Run POS billing and queue operations.","STAFF01","staff123"],admin:["Admin Login","Create student logins, menu items, and reports.","ADMIN01","admin123"]};$("loginRoleText").textContent=map[role][0];$("loginCopy").textContent=map[role][1];$("loginId").value=map[role][2];$("loginPassword").value=map[role][3];show("login")});$("backHome").onclick=()=>show("home");$("logout").onclick=()=>{state.user=null;show("home");save()};$("bell").onclick=()=>{$("noticePanel").classList.toggle("open");state.notices.forEach(n=>n.read=true);render()};$("loginBtn").onclick=()=>{const id=$("loginId").value.trim().toUpperCase(),pass=$("loginPassword").value;if(role==="student"){const s=state.students.find(x=>x.id===id);if(!s)return toast("Student login not found.");if(s.password!==pass)return toast("Incorrect student password.");state.user={role,id:s.id,name:s.name};view="student"}else if(role==="operator"){if(pass!=="staff123")return toast("Incorrect POS password.");state.user={role:"operator",id:"STAFF01",name:"Tuck Shop Staff"};view="pos"}else{if(pass!=="admin123")return toast("Incorrect admin password.");state.user={role:"admin",id:"ADMIN01",name:"School Admin"};view="admin"}show("app");render();toast("Signed in")};
    fetch("/api/tuckq").then(r=>r.json()).then(d=>{if(d.state)state={...starter,...d.state};}).catch(()=>{}).finally(()=>{});
  </script>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/tuckq") return handleApi(request, env);
    if (url.pathname === "/api/mail") return handleMail(request, env);
    if (url.pathname.startsWith("/asset/")) return handleAsset(request);
    return new Response(html(), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  },
};
