(() => {
  const API = (window.CONFIG || {}).API_URL;
  const $ = (id) => document.getElementById(id);
  const chat = $("chat"), input = $("input"), sendBtn = $("send"), ballot = $("ballot"), resetBtn = $("reset"), suggestBtn = $("suggest"), ac = $("ac");

  const CATS = {
    "": { label: "ทุกหมวด", q: [
      "ผู้สมัคร ส.ส. ต้องมีคุณสมบัติอะไรบ้าง",
      "ตรวจสอบรายชื่อและหน่วยเลือกตั้งของตัวเองได้อย่างไร",
      "จังหวัดของฉันมี ส.ส. แบบแบ่งเขตกี่คน" ] },
    law: { label: "กฎหมาย", q: [
      "ใบเหลืองกับใบแดงต่างกันอย่างไร",
      "ซื้อสิทธิ์ขายเสียงมีโทษอย่างไร",
      "อะไรทำให้เสียสิทธิเลือกตั้ง" ] },
    process: { label: "สิทธิและขั้นตอน", q: [
      "ไปเลือกตั้งไม่ได้ต้องแจ้งเหตุอย่างไร",
      "เลือกตั้งล่วงหน้าทำอย่างไร",
      "บัตรเสียคือบัตรแบบไหน" ] },
    data: { label: "ข้อมูลและผลเลือกตั้ง", q: [
      "ผลการเลือกตั้ง ส.ส. ครั้งล่าสุดแต่ละพรรคได้กี่ที่นั่ง",
      "ผู้มาใช้สิทธิ์ครั้งล่าสุดคิดเป็นกี่เปอร์เซ็นต์",
      "ดูผลการเลือกตั้งรายหน่วยได้จากที่ไหน" ] },
    news: { label: "ข่าวล่าสุด", q: [
      "การเลือกตั้งครั้งถัดไปจะมีเมื่อไหร่",
      "กกต. ประกาศอะไรล่าสุด",
      "มีการเลือกตั้งท้องถิ่นอะไรเร็วๆ นี้บ้าง" ] }
  };
  const MODE = { db: "ตอบจากฐานข้อมูลของสำนักงาน", "db+web": "ฐานข้อมูล + ค้นข้อมูลออนไลน์", web: "ค้นข้อมูลออนไลน์" };
  const WELCOME = "สวัสดีครับ ถามเรื่องการเลือกตั้งและกฎหมายเลือกตั้งได้เลย ถามต่อเนื่องได้หลายข้อ ผมจะจำบริบทของบทสนทนานี้ไว้ให้";

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  let clientId = store.get("ect_cid");
  if (!clientId) { clientId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).slice(0, 36); store.set("ect_cid", clientId); }

  // msgs: {role:"user",text} | {role:"model",q,res:{type,mode,answer,sources}}  (เก็บในเครื่องเพื่อให้รีเฟรชแล้วยังอยู่)
  const state = { cat: "", msgs: [], busy: false };
  try { const a = JSON.parse(store.get("ect_chat") || "[]"); if (Array.isArray(a)) state.msgs = a; } catch (e) {}
  const save = () => store.set("ect_chat", JSON.stringify(state.msgs.slice(-40)));
  const historyOf = () => state.msgs.filter((m) => m.role === "user" || (m.res && m.res.type !== "error")).slice(-10)
    .map((m) => m.role === "user" ? { role: "user", text: m.text } : { role: "model", text: m.res.answer.slice(0, 1000) });

  // ---------- แสดงผลข้อความอย่างปลอดภัย ----------
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const inline = (s) => s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  function md(text) {
    let html = "", list = null;
    const close = () => { if (list) { html += `</${list}>`; list = null; } };
    for (const raw of esc(text).split("\n")) {
      const l = raw.trim(); let m;
      if ((m = l.match(/^[-*•]\s+(.*)/))) { if (list !== "ul") { close(); html += "<ul>"; list = "ul"; } html += `<li>${inline(m[1])}</li>`; }
      else if ((m = l.match(/^\d+[.)]\s+(.*)/))) { if (list !== "ol") { close(); html += "<ol>"; list = "ol"; } html += `<li>${inline(m[1])}</li>`; }
      else if ((m = l.match(/^#{1,4}\s+(.*)/))) { close(); html += `<p><strong>${inline(m[1])}</strong></p>`; }
      else if (!l) close();
      else { close(); html += `<p>${inline(l)}</p>`; }
    }
    close(); return html;
  }

  // ---------- คำถามแนะนำ ----------
  function renderBallot() {
    const tabs = $("tabs"); tabs.innerHTML = "";
    Object.entries(CATS).forEach(([key, c]) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = c.label; b.setAttribute("aria-pressed", String(key === state.cat));
      b.onclick = () => { state.cat = key; renderBallot(); };
      tabs.appendChild(b);
    });
    const box = $("options"); box.innerHTML = "";
    CATS[state.cat].q.forEach((q) => {
      const o = document.createElement("button");
      o.type = "button"; o.className = "option";
      o.innerHTML = '<span class="box" aria-hidden="true"></span><span></span>';
      o.lastChild.textContent = q;
      o.onclick = () => { o.classList.add("stamped"); setTimeout(() => send(q), 260); };
      box.appendChild(o);
    });
  }

  // ---------- ข้อความในแชต ----------
  const toEnd = () => { chat.scrollTop = chat.scrollHeight; };
  function addWelcome() {
    const d = document.createElement("div"); d.className = "msg model welcome"; d.textContent = WELCOME; chat.appendChild(d);
  }
  function addUser(text) {
    const d = document.createElement("div"); d.className = "msg user"; d.textContent = text; chat.appendChild(d); toEnd();
  }
  function addModel(res, question) {
    const d = document.createElement("div");
    const clarify = res.type === "clarify", isErr = res.type === "error";
    d.className = "msg model" + (clarify ? " clarify" : "") + (isErr ? " err" : "");
    d.innerHTML = (clarify ? '<span class="tag">ขอถามเพิ่มเติม</span>' : "") + md(res.answer);
    const goodSrc = (res.sources || []).filter((x) => /^https?:\/\//.test(x.url || ""));
    if (goodSrc.length) {
      const s = document.createElement("div"); s.className = "src"; s.textContent = "แหล่งอ้างอิง";
      const ul = document.createElement("ul");
      goodSrc.forEach((x) => {
        const li = document.createElement("li"), a = document.createElement("a");
        a.href = x.url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = x.title || x.url;
        li.appendChild(a); ul.appendChild(li);
      });
      s.appendChild(ul); d.appendChild(s);
    }
    if (!clarify && !isErr) {
      const meta = document.createElement("div"); meta.className = "meta";
      if (MODE[res.mode]) { const bd = document.createElement("span"); bd.className = "badge " + res.mode.replace("+", "-"); bd.textContent = MODE[res.mode]; meta.appendChild(bd); }
      const fb = document.createElement("span"); fb.className = "fb"; fb.append("คำตอบนี้ช่วยได้ไหม");
      ["up", "down"].forEach((r) => {
        const b = document.createElement("button"); b.type = "button"; b.textContent = r === "up" ? "ช่วยได้" : "ยังไม่ถูกต้อง";
        b.onclick = () => { fb.querySelectorAll("button").forEach((x) => (x.disabled = true)); fb.append(" ขอบคุณสำหรับความเห็น"); post({ action: "feedback", clientId, rating: r, question, answer: res.answer.slice(0, 500) }).catch(() => {}); };
        fb.appendChild(b);
      });
      meta.appendChild(fb); d.appendChild(meta);
    }
    if (!isErr && (res.suggestions || []).length) {
      const r = document.createElement("div"); r.className = "related"; r.textContent = "คำถามใกล้เคียง";
      res.suggestions.slice(0, 4).forEach((q) => {
        const b = document.createElement("button"); b.type = "button"; b.textContent = q; b.onclick = () => send(q); r.appendChild(b);
      });
      d.appendChild(r);
    }
    chat.appendChild(d); d.scrollIntoView({ block: "start" });
  }
  function addError(msg) {
    const d = document.createElement("div"); d.className = "msg model err"; d.textContent = msg; chat.appendChild(d); toEnd();
  }
  function addTyping() {
    const d = document.createElement("div"); d.className = "msg model wait";
    d.innerHTML = '<span>กำลังพิมพ์</span><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>';
    chat.appendChild(d); toEnd(); return d;
  }

  async function post(body) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 60000);
    try {
      // text/plain เพื่อเลี่ยง CORS preflight ของ Apps Script
      const r = await fetch(API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body), signal: ctl.signal });
      return await r.json();
    } finally { clearTimeout(t); }
  }

  function syncUI() {
    const has = state.msgs.length > 0;
    resetBtn.hidden = !has; ballot.hidden = has;
  }

  async function send(text) {
    text = (text || "").trim();
    if (!text || state.busy) return;
    if (!API || API.includes("วางรหัส")) { addError("ยังไม่ได้ตั้งค่า API_URL ในไฟล์ config.js"); return; }
    state.busy = true; sendBtn.disabled = true; acSeq++; acHide();
    const history = historyOf();                       // บริบทก่อนข้อนี้ (สูงสุด 10 ข้อความ)
    state.msgs.push({ role: "user", text }); save(); syncUI();
    addUser(text); input.value = ""; autosize();
    const wait = addTyping();
    try {
      const res = await post({ action: "ask", clientId, question: text, category: state.cat, history });
      wait.remove();
      if (!res.ok) addError(res.error || "เกิดข้อผิดพลาด กรุณาลองใหม่");
      else {
        addModel(res, text);
        if (res.type !== "error") { state.msgs.push({ role: "model", q: text, res: { type: res.type, mode: res.mode, answer: res.answer, sources: res.sources || [], suggestions: res.suggestions || [] } }); save(); }
      }
    } catch (e) {
      wait.remove(); addError("เชื่อมต่อไม่สำเร็จหรือใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง");
    } finally { state.busy = false; sendBtn.disabled = false; input.focus(); }
  }

  // ---------- เสนอคำถามใกล้เคียงขณะพิมพ์ ----------
  let acTimer = 0, acSeq = 0;
  const acHide = () => { ac.hidden = true; ac.innerHTML = ""; };
  function acShow(items) {
    ac.innerHTML = "";
    if (!items.length) { ac.hidden = true; return; }
    items.forEach((q) => {
      const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "option"); b.textContent = q;
      b.onmousedown = (e) => e.preventDefault();
      b.onclick = () => { acHide(); send(q); };
      ac.appendChild(b);
    });
    ac.hidden = false;
  }
  function acQuery() {
    clearTimeout(acTimer);
    const v = input.value.trim();
    if (v.length < 2 || !API) { acSeq++; acHide(); return; }
    acTimer = setTimeout(async () => {
      const my = ++acSeq;
      try { const r = await post({ action: "suggest", clientId, q: v }); if (my === acSeq && r.ok && input.value.trim() === v) acShow(r.items || []); } catch (e) {}
    }, 300);
  }
  input.addEventListener("input", acQuery);
  input.addEventListener("blur", () => setTimeout(acHide, 150));
  input.addEventListener("keydown", (e) => { if (e.key === "Escape") acHide(); });

  function autosize() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; }
  input.addEventListener("input", autosize);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); } });
  sendBtn.onclick = () => send(input.value);
  suggestBtn.onclick = () => { ballot.hidden = !ballot.hidden; if (!ballot.hidden) ballot.scrollIntoView({ block: "nearest" }); };
  resetBtn.onclick = () => {
    if (state.msgs.length && !confirm("เริ่มบทสนทนาใหม่? ข้อความเดิมจะถูกล้าง")) return;
    state.msgs = []; store.del("ect_chat"); chat.innerHTML = ""; addWelcome(); syncUI(); renderBallot();
  };

  // ---------- เริ่มต้น: คืนบทสนทนาเดิม ----------
  addWelcome();
  state.msgs.forEach((m) => { if (m.role === "user") addUser(m.text); else addModel(m.res, m.q); });
  syncUI(); renderBallot(); toEnd();
})();
