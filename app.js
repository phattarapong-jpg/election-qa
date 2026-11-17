(() => {
  const API = (window.CONFIG || {}).API_URL;
  const $ = (id) => document.getElementById(id);
  const chat = $("chat"), input = $("input"), sendBtn = $("send"), ballot = $("ballot");

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

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  let clientId = store.get("ect_cid");
  if (!clientId) { clientId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).slice(0, 36); store.set("ect_cid", clientId); }

  const state = { cat: "", history: [], busy: false };

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

  // ---------- ใบลงคะแนน (คำถามแนะนำ) ----------
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
  function addUser(text) {
    const d = document.createElement("div"); d.className = "msg user"; d.textContent = text; chat.appendChild(d); d.scrollIntoView({ block: "end" });
  }
  function addModel(res, question) {
    const d = document.createElement("div");
    const clarify = res.type === "clarify";
    d.className = "msg model" + (clarify ? " clarify" : "");
    d.innerHTML = (clarify ? '<span class="tag">ขอถามเพิ่มเติม</span>' : "") + md(res.answer);
    if (res.sources && res.sources.length) {
      const s = document.createElement("div"); s.className = "src"; s.textContent = "แหล่งอ้างอิง";
      const ul = document.createElement("ul");
      res.sources.forEach((x) => {
        if (!/^https?:\/\//.test(x.url || "")) return;
        const li = document.createElement("li"), a = document.createElement("a");
        a.href = x.url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = x.title || x.url;
        li.appendChild(a); ul.appendChild(li);
      });
      s.appendChild(ul); d.appendChild(s);
    }
    if (!clarify) {
      const fb = document.createElement("div"); fb.className = "fb"; fb.append("คำตอบนี้ช่วยได้ไหม");
      ["up", "down"].forEach((r) => {
        const b = document.createElement("button"); b.type = "button"; b.textContent = r === "up" ? "ช่วยได้" : "ยังไม่ถูกต้อง";
        b.onclick = () => { fb.querySelectorAll("button").forEach((x) => (x.disabled = true)); fb.append(" ขอบคุณสำหรับความเห็น"); post({ action: "feedback", clientId, rating: r, question, answer: res.answer.slice(0, 500) }).catch(() => {}); };
        fb.appendChild(b);
      });
      d.appendChild(fb);
    }
    chat.appendChild(d); d.scrollIntoView({ block: "start" });
  }
  function addError(msg) {
    const d = document.createElement("div"); d.className = "msg model err"; d.textContent = msg; chat.appendChild(d); d.scrollIntoView({ block: "end" });
  }

  async function post(body) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 60000);
    try {
      // text/plain เพื่อเลี่ยง CORS preflight ของ Apps Script
      const r = await fetch(API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body), signal: ctl.signal });
      return await r.json();
    } finally { clearTimeout(t); }
  }

  async function send(text) {
    text = (text || "").trim();
    if (!text || state.busy) return;
    if (!API || API.includes("วางรหัส")) { addError("ยังไม่ได้ตั้งค่า API_URL ในไฟล์ config.js"); return; }
    state.busy = true; sendBtn.disabled = true;
    ballot.hidden = true; $("reset").hidden = false;
    const history = state.history.slice(-6);
    addUser(text); input.value = ""; autosize();
    const wait = document.createElement("div"); wait.className = "msg model wait"; wait.textContent = "กำลังค้นหาข้อมูล…"; chat.appendChild(wait); wait.scrollIntoView({ block: "end" });
    try {
      const res = await post({ action: "ask", clientId, question: text, category: state.cat, history });
      wait.remove();
      if (!res.ok) addError(res.error || "เกิดข้อผิดพลาด กรุณาลองใหม่");
      else { addModel(res, text); state.history.push({ role: "user", text }, { role: "model", text: res.answer.slice(0, 1000) }); }
    } catch (e) {
      wait.remove(); addError("เชื่อมต่อไม่สำเร็จหรือใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง");
    } finally { state.busy = false; sendBtn.disabled = false; input.focus(); }
  }

  function autosize() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; }
  input.addEventListener("input", autosize);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); } });
  sendBtn.onclick = () => send(input.value);
  $("reset").onclick = () => { state.history = []; chat.innerHTML = ""; ballot.hidden = false; $("reset").hidden = true; renderBallot(); };

  renderBallot();
})();
