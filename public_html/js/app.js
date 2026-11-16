import { QUESTIONS } from "./questions.js";

const STORAGE_KEY = "couples_translator_profile_v1";

const el = (id) => document.getElementById(id);

const state = {
  view: "start",
  block: "A",
  step: 0,
  displayName: "",
  answers: { blockA: {}, blockB: {} },
};

function allSteps() {
  const steps = [];
  QUESTIONS.blockA.forEach((q, i) => steps.push({ block: "A", index: i, q }));
  QUESTIONS.blockB.forEach((q, i) => steps.push({ block: "B", index: i, q }));
  return steps;
}

function currentStepDef() {
  return allSteps()[state.step];
}

function progressPct() {
  const total = allSteps().length;
  return Math.round(((state.step + 1) / total) * 100);
}

function saveLocal() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      displayName: state.displayName,
      answers: state.answers,
      updatedAt: new Date().toISOString(),
    }),
  );
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.displayName) state.displayName = data.displayName;
    if (data.answers) state.answers = data.answers;
  } catch {
    /* ignore */
  }
}

function buildExportPayload() {
  const block_a = { ...state.answers.blockA };
  const duration = state.answers.blockB.B1_duration;
  const living = state.answers.blockB.B1_living;
  const b1Map = {
    less_year: "меньше года",
    "1-3": "1-3 года",
    more_3: "больше 3 лет",
    prefer_not: "prefer_not",
  };
  const livingMap = { yes: true, no: false, sometimes: null };

  const block_b = {
    B1_duration_cohabitation: {
      duration_label: b1Map[duration] || duration,
      living_together: livingMap[living] ?? null,
    },
    B2_frequent_disagreements: state.answers.blockB.B2_frequent_disagreements,
    B3_missing_now: state.answers.blockB.B3_missing_now || "",
    B4_partner_strengths: state.answers.blockB.B4_partner_strengths || "",
    B5_improve_one_month: state.answers.blockB.B5_improve_one_month || "",
  };

  return {
    version: 1,
    display_name: state.displayName,
    exported_at: new Date().toISOString(),
    questionnaire: {
      block_a,
      block_b,
    },
  };
}

function downloadJson() {
  const payload = buildExportPayload();
  const safeName = (state.displayName || "anketa").replace(/[^\w\u0400-\u04FF-]+/gi, "_");
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `perevodchik_anketa_${safeName}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function collectAnswer(q) {
  const key = q.id;
  const blockKey = q.id.startsWith("B") ? "blockB" : "blockA";

  if (q.type === "text") {
    const input = el("text-answer");
    const val = (input?.value || "").trim();
    if (!val && key !== "B3_missing_now") return null;
    state.answers[blockKey][key] = val;
    return val;
  }

  if (q.type === "single") {
    const checked = document.querySelector('input[name="opt"]:checked');
    if (!checked) return null;
    let val = checked.value;
    if (val === "other") {
      const other = el("other-text")?.value?.trim();
      if (!other) return null;
      val = { other: other };
    }
    state.answers[blockKey][key] = val;
    return val;
  }

  if (q.type === "multi") {
    const boxes = [...document.querySelectorAll('input[name="opt-m"]:checked')].map((c) => c.value);
    if (boxes.length === 0) return null;
    if (boxes.includes("skip") && boxes.length > 1) {
      return "skip_conflict";
    }
    state.answers[blockKey][key] = boxes;
    return boxes;
  }
  return null;
}

function getStoredValue(q) {
  const blockKey = q.id.startsWith("B") ? "blockB" : "blockA";
  return state.answers[blockKey]?.[q.id];
}

function renderQuestion() {
  const def = currentStepDef();
  if (!def) return;

  const { q } = def;
  const title = el("question-title");
  const body = el("question-body");
  const err = el("step-error");
  err.textContent = "";
  err.classList.add("hidden");

  let badge = "";
  if (q.private) badge = '<span class="private-badge">только для тебя</span>';
  title.innerHTML = `${q.text}${badge}`;

  const stored = getStoredValue(q);
  body.innerHTML = "";

  if (q.hint) {
    body.innerHTML += `<p class="hint">${q.hint}</p>`;
  }

  if (q.type === "text") {
    body.innerHTML += `<textarea id="text-answer" rows="4" maxlength="${q.maxLength || 2000}">${stored || ""}</textarea>`;
    renderNav();
    el("progress-fill").style.width = `${progressPct()}%`;
    return;
  }

  if (q.type === "single") {
    const wrap = document.createElement("div");
    wrap.className = "options";
    q.options.forEach((opt) => {
      const id = `opt-${opt.value}`;
      const checked =
        stored === opt.value ||
        (typeof stored === "object" && stored?.other && opt.value === "other");
      wrap.innerHTML += `
        <label class="option" for="${id}">
          <input type="radio" name="opt" id="${id}" value="${opt.value}" ${checked ? "checked" : ""} />
          <span>${opt.label}</span>
        </label>`;
    });
    body.appendChild(wrap);
    body.innerHTML += `<input type="text" class="name-input hidden" id="other-text" placeholder="Свой вариант" />`;

    const syncOther = () => {
      const sel = document.querySelector('input[name="opt"]:checked');
      const other = el("other-text");
      if (sel?.value === "other") {
        other.classList.remove("hidden");
        if (typeof stored === "object" && stored?.other) other.value = stored.other;
      } else other.classList.add("hidden");
    };
    body.querySelectorAll('input[name="opt"]').forEach((inp) => inp.addEventListener("change", syncOther));
    syncOther();
  }

  if (q.type === "multi") {
    const wrap = document.createElement("div");
    wrap.className = "options";
    const arr = Array.isArray(stored) ? stored : [];
    q.options.forEach((opt) => {
      const id = `optm-${opt.value}`;
      wrap.innerHTML += `
        <label class="option" for="${id}">
          <input type="checkbox" name="opt-m" id="${id}" value="${opt.value}" ${arr.includes(opt.value) ? "checked" : ""} />
          <span>${opt.label}</span>
        </label>`;
    });
    body.appendChild(wrap);
  }

  renderNav();
  el("progress-fill").style.width = `${progressPct()}%`;
}

function renderNav() {
  const back = el("btn-back");
  const next = el("btn-next");
  back.disabled = state.step === 0;
  next.textContent = state.step >= allSteps().length - 1 ? "Завершить" : "Далее";
}

function showView(name) {
  state.view = name;
  el("view-start").classList.toggle("hidden", name !== "start");
  el("view-form").classList.toggle("hidden", name !== "form");
  el("view-done").classList.toggle("hidden", name !== "done");
}

function renderDone() {
  el("done-name").textContent = state.displayName || "без имени";
  const url = new URL(window.location.href);
  url.hash = "";
  el("share-link").textContent = url.origin + url.pathname;
  const msg = el("save-server-msg");
  if (msg) msg.textContent = "";
}

async function saveToServer() {
  const msg = el("save-server-msg");
  const payload = buildExportPayload();
  try {
    const res = await fetch("api/save.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.ok) {
      msg.textContent = `Сохранено на сервере (#${data.id}).`;
      msg.style.color = "var(--ok)";
    } else if (data.error === "db_not_configured") {
      msg.textContent = "Серверное хранилище ещё не настроено — используй скачивание JSON.";
    } else {
      msg.textContent = `Не удалось сохранить: ${data.error || res.status}`;
    }
  } catch {
    msg.textContent = "Ошибка сети при сохранении.";
  }
}

function startForm() {
  const name = el("input-name").value.trim();
  if (!name) {
    el("start-error").textContent = "Укажи имя — так отличим твою анкету от анкеты Насти";
    el("start-error").classList.remove("hidden");
    return;
  }
  state.displayName = name;
  el("form-subtitle").textContent = `Анкета: ${name}`;
  showView("form");
  renderQuestion();
}

function nextStep() {
  const def = currentStepDef();
  const err = el("step-error");
  const result = collectAnswer(def.q);
  if (result === "skip_conflict") {
    err.textContent = "«Пропустить» нельзя выбрать вместе с другими пунктами";
    err.classList.remove("hidden");
    return;
  }
  if (result === null || result === "") {
    err.textContent = "Ответь на вопрос или напиши хотя бы коротко";
    err.classList.remove("hidden");
    return;
  }
  saveLocal();

  if (state.step >= allSteps().length - 1) {
    showView("done");
    renderDone();
    saveLocal();
    return;
  }
  state.step += 1;
  renderQuestion();
}

function prevStep() {
  if (state.step > 0) {
    state.step -= 1;
    renderQuestion();
  }
}

function importFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const q = data.questionnaire || data;
      state.displayName = data.display_name || data.displayName || state.displayName;
      state.answers.blockA = { ...(q.block_a || {}) };
      const bb = q.block_b || {};
      state.answers.blockB = {
        B1_duration: mapDurationBack(bb.B1_duration_cohabitation?.duration_label),
        B1_living: mapLivingBack(bb.B1_duration_cohabitation?.living_together),
        B2_frequent_disagreements: bb.B2_frequent_disagreements,
        B3_missing_now: bb.B3_missing_now,
        B4_partner_strengths: bb.B4_partner_strengths,
        B5_improve_one_month: bb.B5_improve_one_month,
      };
      saveLocal();
      alert("Анкета загружена из файла");
    } catch {
      alert("Не удалось прочитать JSON");
    }
  };
  reader.readAsText(file);
}

function mapDurationBack(label) {
  if (!label) return "";
  if (label.includes("меньше")) return "less_year";
  if (label.includes("1-3")) return "1-3";
  if (label.includes("больше")) return "more_3";
  return "prefer_not";
}

function mapLivingBack(v) {
  if (v === true) return "yes";
  if (v === false) return "no";
  return "sometimes";
}

function init() {
  loadLocal();
  if (state.displayName) el("input-name").value = state.displayName;

  el("btn-begin").addEventListener("click", startForm);
  el("btn-next").addEventListener("click", nextStep);
  el("btn-back").addEventListener("click", prevStep);
  el("btn-download").addEventListener("click", downloadJson);
  el("btn-save-server")?.addEventListener("click", saveToServer);
  el("btn-restart").addEventListener("click", () => {
    state.step = 0;
    showView("form");
    renderQuestion();
  });
  el("btn-new-person").addEventListener("click", () => {
    state.answers = { blockA: {}, blockB: {} };
    state.step = 0;
    state.displayName = "";
    el("input-name").value = "";
    localStorage.removeItem(STORAGE_KEY);
    showView("start");
  });
  el("import-file").addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) importFile(f);
  });
}

init();