import { QUESTIONS, FORM_CHOICE_HINT } from "./questions.js?v=20261116c";
import {
  appendTurn,
  callPartnerAs,
  dialogStorageId,
  loadDialog,
  saveDialog,
  sanitizeRecipient,
  translateFeelings,
} from "./translator.js?v=20261116c";

const STORAGE_KEY = "couples_translator_profile_v1";
const PAIR_STORAGE_KEY = "couples_translator_pair_v1";

const el = (id) => document.getElementById(id);

function emptyAnswers() {
  return { intro: {}, blockA: {}, blockB: {}, nicknames: {} };
}

const state = {
  view: "start",
  block: "A",
  step: 0,
  displayName: "",
  answers: emptyAnswers(),
  pair: {
    code: "",
    role: "", // owner | partner
  },
  partnerProfile: null,
  lastResult: null,
};

function allSteps() {
  const steps = [];
  QUESTIONS.blockIntro.forEach((q, i) => steps.push({ block: "P", index: i, q }));
  QUESTIONS.blockA.forEach((q, i) => steps.push({ block: "A", index: i, q }));
  QUESTIONS.blockB.forEach((q, i) => steps.push({ block: "B", index: i, q }));
  QUESTIONS.blockNick.forEach((q, i) => steps.push({ block: "N", index: i, q }));
  return steps;
}

function answerBucket(id) {
  if (id.startsWith("P0")) return "intro";
  if (id.startsWith("N")) return "nicknames";
  if (id.startsWith("B")) return "blockB";
  return "blockA";
}

function currentStepDef() {
  return allSteps()[state.step];
}

function progressPct() {
  const total = allSteps().length;
  return Math.round(((state.step + 1) / total) * 100);
}

function normalizeCodeInput(raw) {
  return (raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

function savePairLocal() {
  localStorage.setItem(
    PAIR_STORAGE_KEY,
    JSON.stringify({ code: state.pair.code, role: state.pair.role }),
  );
}

function loadPairLocal() {
  try {
    const raw = localStorage.getItem(PAIR_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.code) state.pair.code = normalizeCodeInput(data.code);
    if (data.role) state.pair.role = data.role;
  } catch {
    /* ignore */
  }
}

function repairPairState() {
  if (!state.pair.code) {
    state.pair.role = "";
    return;
  }
  if (!state.pair.role) state.pair.role = "owner";
}

function showStartFeedback(message, { ok = false, useError = false } = {}) {
  const msg = el("start-pair-msg");
  const err = el("start-error");
  if (useError) {
    err.textContent = message;
    err.classList.remove("hidden");
    msg?.classList.add("hidden");
    if (msg) msg.textContent = "";
    return;
  }
  err.classList.add("hidden");
  if (msg) {
    msg.textContent = message;
    msg.classList.remove("hidden");
    msg.classList.toggle("ok", ok);
    msg.style.color = ok ? "var(--ok)" : "var(--muted)";
  }
}

function inviteUrl(code) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  if (code) url.searchParams.set("join", code);
  return url.toString();
}

function parseJoinFromUrl() {
  const url = new URL(window.location.href);
  const join = url.searchParams.get("join");
  if (!join) return "";
  return normalizeCodeInput(join);
}

function stripJoinFromUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("join")) return;
  url.searchParams.delete("join");
  const next = url.pathname + (url.search ? url.search : "") + url.hash;
  window.history.replaceState({}, "", next);
}

async function apiPair(body) {
  const res = await fetch("api/pair.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok, status: res.status, data };
}

async function fetchPairStatus(code) {
  try {
    const res = await fetch(`api/pair.php?code=${encodeURIComponent(code)}`);
    const data = await res.json();
    if (data.ok && data.pair) return data.pair;
  } catch {
    /* ignore */
  }
  return null;
}

function saveLocal() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      displayName: state.displayName,
      answers: state.answers,
      pair: state.pair,
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
    if (data.answers) {
      state.answers = { ...emptyAnswers(), ...data.answers };
      state.answers.intro = data.answers.intro || {};
      state.answers.blockA = data.answers.blockA || {};
      state.answers.blockB = data.answers.blockB || {};
      state.answers.nicknames = data.answers.nicknames || {};
    }
    if (data.pair?.code) {
      state.pair.code = normalizeCodeInput(data.pair.code);
      state.pair.role = data.pair.role || state.pair.role;
    }
  } catch {
    /* ignore */
  }
}

function parseChoiceStored(stored, legacySingle) {
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    if ("selected" in stored || "value" in stored) {
      const fromValue = stored.value ? [stored.value] : [];
      return {
        selected: stored.selected ?? fromValue,
        custom: stored.custom ?? "",
      };
    }
    if (stored.other) return { selected: [], custom: stored.other };
  }
  if (Array.isArray(stored)) return { selected: stored, custom: "" };
  if (typeof stored === "string" && stored) {
    return legacySingle ? { selected: [], custom: stored } : { selected: [stored], custom: "" };
  }
  return { selected: [], custom: "" };
}

function multiExport(stored) {
  const parsed = parseChoiceStored(stored, false);
  return { selected: parsed.selected, custom: parsed.custom || "" };
}

function buildExportPayload() {
  const block_a = { ...state.answers.blockA };

  const durationObj = multiExport(state.answers.blockB.B1_duration);
  const livingObj = multiExport(state.answers.blockB.B1_living);

  const block_b = {
    B1_duration_cohabitation: {
      duration: durationObj,
      living: livingObj,
    },
    B2_frequent_disagreements: state.answers.blockB.B2_frequent_disagreements,
    B3_missing_now: state.answers.blockB.B3_missing_now || "",
    B4_partner_strengths: state.answers.blockB.B4_partner_strengths || "",
    B5_improve_one_month: state.answers.blockB.B5_improve_one_month || "",
  };

  return {
    version: 2,
    display_name: state.displayName,
    pair_code: state.pair.code || null,
    pair_role: state.pair.role || null,
    exported_at: new Date().toISOString(),
    questionnaire: {
      intro: { ...state.answers.intro },
      block_a,
      block_b,
      nicknames: { ...state.answers.nicknames },
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

function appendCustomTextField(body, storedCustom) {
  const box = document.createElement("div");
  box.className = "custom-answer-block";
  box.innerHTML = `
    <label class="field-label" for="custom-answer">Свой вариант / уточнение</label>
    <p class="hint">Можно дописать своими словами — даже если уже отметил пункты выше.</p>
    <textarea id="custom-answer" rows="3" maxlength="500" placeholder="Напиши своими словами…">${storedCustom || ""}</textarea>`;
  body.appendChild(box);
}

function collectAnswer(q) {
  const key = q.id;
  const blockKey = answerBucket(key);

  if (q.type === "pair_names") {
    const call_partner = el("nick-partner")?.value?.trim() || "";
    const partner_calls_me = el("nick-me")?.value?.trim() || "";
    if (!call_partner || !partner_calls_me) return null;
    state.answers.nicknames = { call_partner, partner_calls_me };
    return state.answers.nicknames;
  }

  if (q.type === "number") {
    const raw = el("number-answer")?.value;
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < (q.min || 16) || n > (q.max || 99)) return "age_invalid";
    state.answers[blockKey][key] = n;
    return n;
  }

  if (q.type === "single") {
    const checked = document.querySelector('input[name="opt"]:checked');
    if (!checked) return null;
    state.answers[blockKey][key] = checked.value;
    return checked.value;
  }

  if (q.type === "text") {
    const input = el("text-answer");
    const val = (input?.value || "").trim();
    if (!val && key !== "B3_missing_now") return null;
    state.answers[blockKey][key] = val;
    return val;
  }

  const custom = el("custom-answer")?.value?.trim() || "";
  const boxes = [...document.querySelectorAll('input[name="opt-m"]:checked')].map((c) => c.value);
  if (boxes.includes("skip") && boxes.length > 1) {
    return "skip_conflict";
  }
  if (boxes.length === 0 && !custom) return null;
  const payload = { selected: boxes, custom };
  state.answers[blockKey][key] = payload;
  return payload;
}

function getStoredValue(q) {
  if (q.type === "pair_names") return state.answers.nicknames;
  return state.answers[answerBucket(q.id)]?.[q.id];
}

function renderQuestion() {
  const def = currentStepDef();
  if (!def) return;

  const { q } = def;
  const title = el("question-title");
  const body = el("question-body");
  const err = el("step-error");
  const choiceBanner = el("form-choice-hint");
  err.textContent = "";
  err.classList.add("hidden");

  let badge = "";
  if (q.private) badge = '<span class="private-badge">только для тебя</span>';
  title.innerHTML = `${q.text}${badge}`;

  const stored = getStoredValue(q);
  body.innerHTML = "";

  if (q.type === "pair_names") {
    choiceBanner.classList.add("hidden");
    if (q.hint) body.innerHTML += `<p class="hint">${q.hint}</p>`;
    const nicks = stored || {};
    body.innerHTML += `
      <div class="nick-grid">
        <div>
          <label class="field-label" for="nick-partner">Как ты называешь партнёра?</label>
          <input type="text" id="nick-partner" class="name-input" maxlength="40" placeholder="Например, Жужу" value="${escapeAttr(nicks.call_partner || "")}" />
        </div>
        <div>
          <label class="field-label" for="nick-me">Как партнёр называет тебя?</label>
          <input type="text" id="nick-me" class="name-input" maxlength="40" placeholder="Например, Китя" value="${escapeAttr(nicks.partner_calls_me || "")}" />
        </div>
      </div>`;
  } else if (q.type === "number") {
    choiceBanner.classList.add("hidden");
    if (q.hint) body.innerHTML += `<p class="hint">${q.hint}</p>`;
    body.innerHTML += `<input type="number" id="number-answer" min="${q.min || 16}" max="${q.max || 99}" inputmode="numeric" value="${stored || ""}" />`;
  } else if (q.type === "single") {
    choiceBanner.classList.add("hidden");
    if (q.hint) body.innerHTML += `<p class="hint">${q.hint}</p>`;
    const wrap = document.createElement("div");
    wrap.className = "options";
    q.options.forEach((opt) => {
      const id = `opt-${opt.value}`;
      const checked = stored === opt.value;
      wrap.innerHTML += `
        <label class="option" for="${id}">
          <input type="radio" name="opt" id="${id}" value="${opt.value}" ${checked ? "checked" : ""} />
          <span>${opt.label}</span>
        </label>`;
    });
    body.appendChild(wrap);
  } else if (q.type === "text") {
    choiceBanner.classList.add("hidden");
    if (q.hint) body.innerHTML += `<p class="hint">${q.hint}</p>`;
    body.innerHTML += `<textarea id="text-answer" rows="4" maxlength="${q.maxLength || 2000}">${stored || ""}</textarea>`;
  } else {
    choiceBanner.textContent = FORM_CHOICE_HINT;
    choiceBanner.classList.remove("hidden");
    if (q.hint) body.innerHTML += `<p class="hint">${q.hint}</p>`;
    const parsed = parseChoiceStored(stored, false);
    const wrap = document.createElement("div");
    wrap.className = "options";
    q.options.forEach((opt) => {
      const id = `optm-${opt.value}`;
      wrap.innerHTML += `
        <label class="option" for="${id}">
          <input type="checkbox" name="opt-m" id="${id}" value="${opt.value}" ${parsed.selected.includes(opt.value) ? "checked" : ""} />
          <span>${opt.label}</span>
        </label>`;
    });
    body.appendChild(wrap);
    appendCustomTextField(body, parsed.custom);
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

function escapeAttr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isQuestionnaireComplete() {
  return Boolean(
    state.answers.intro?.P0_gender &&
      state.answers.intro?.P0_age &&
      state.answers.intro?.P0_zodiac &&
      state.answers.nicknames?.call_partner &&
      state.answers.nicknames?.partner_calls_me &&
      state.answers.blockA?.A1_upset_need,
  );
}

function senderProfile() {
  const payload = buildExportPayload();
  return {
    display_name: state.displayName,
    answers: state.answers,
    questionnaire: payload.questionnaire,
    nicknames: state.answers.nicknames,
    intro: state.answers.intro,
  };
}

function pairDialogId() {
  return dialogStorageId(state.pair.code || "local", state.pair.role || "me");
}

function updateTabs() {
  const tabs = el("main-tabs");
  if (!tabs) return;
  const ready = isQuestionnaireComplete();
  tabs.classList.toggle("hidden", !ready);
  el("tab-form")?.classList.toggle("active", state.view === "form" || state.view === "done");
  el("tab-translate")?.classList.toggle("active", state.view === "translate");
}

function showView(name) {
  state.view = name;
  el("view-start").classList.toggle("hidden", name !== "start");
  el("view-form").classList.toggle("hidden", name !== "form");
  el("view-done").classList.toggle("hidden", name !== "done");
  el("view-translate")?.classList.toggle("hidden", name !== "translate");
  updateTabs();
}

function updateStartPairPanel() {
  const panel = el("start-code-panel");
  if (!state.pair.code || state.pair.role !== "owner") {
    panel?.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");
  el("start-invite-code").textContent = state.pair.code;
  el("start-invite-link").textContent = inviteUrl(state.pair.code);
}

async function copyText(text, msgEl, okText) {
  try {
    await navigator.clipboard.writeText(text);
    if (msgEl) {
      msgEl.textContent = okText;
      msgEl.style.color = "var(--ok)";
    }
  } catch {
    if (msgEl) msgEl.textContent = "Не удалось скопировать — выдели текст вручную";
  }
}

function formatPairStatus(pair) {
  if (!pair) return "Статус пары: обновляется…";
  if (pair.paired) {
    return `Пара связана: ${pair.owner_name || "—"} и ${pair.partner_name || "—"} — обе анкеты на сервере.`;
  }
  const waits = [];
  if (!pair.owner_has_profile) waits.push("ждём твою анкету");
  if (!pair.partner_name) waits.push("ждём партнёра (код или ссылку)");
  else if (!pair.partner_has_profile) waits.push(`ждём анкету ${pair.partner_name}`);
  return `Статус: ${waits.join("; ")}.`;
}

async function refreshDonePairStatus() {
  const statusEl = el("done-pair-status");
  if (!state.pair.code) {
    statusEl.textContent = "Код пары не задан — создай код на старте или дождись генерации после завершения.";
    return;
  }
  const pair = await fetchPairStatus(state.pair.code);
  statusEl.textContent = formatPairStatus(pair);
}

async function pushProfileToPair() {
  if (!state.pair.code || !state.pair.role) return { ok: false };
  const payload = buildExportPayload();
  const { ok, data } = await apiPair({
    action: "save_profile",
    code: state.pair.code,
    role: state.pair.role,
    display_name: state.displayName,
    profile: payload,
  });
  return { ok, pair: data.pair };
}

async function renderDone() {
  el("done-name").textContent = state.displayName || "без имени";

  if (!state.pair.code) {
    const created = await apiPair({
      action: "create",
      display_name: state.displayName,
    });
    if (created.ok && created.data.pair?.code) {
      state.pair.code = created.data.pair.code;
      state.pair.role = "owner";
      savePairLocal();
    }
  } else {
    await pushProfileToPair();
  }

  el("done-invite-code").textContent = state.pair.code || "———";
  el("done-invite-link").textContent = state.pair.code ? inviteUrl(state.pair.code) : "—";

  const roleText =
    state.pair.role === "partner"
      ? "Ты подключился(ась) по коду партнёра — анкета ушла в общую пару на сервер."
      : "Ты создал(а) код пары — отправь код или ссылку партнёру, пусть заполнит анкету у себя.";
  el("done-pair-role").textContent = roleText;

  await refreshDonePairStatus();
  await saveToServer();
  saveLocal();
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
      msg.textContent =
        "MySQL на сервере ещё не настроен (нет config.local.php) — анкета в паре через код; настройка: README Webapp.";
    } else {
      msg.textContent = `Не удалось сохранить: ${data.error || res.status}`;
    }
  } catch {
    msg.textContent = "Ошибка сети при сохранении.";
  }
}

async function generatePairCode() {
  const btn = el("btn-gen-code");
  const name = el("input-name").value.trim();
  if (!name) {
    showStartFeedback("Сначала укажи имя — так код будет привязан к твоей анкете.", { useError: true });
    el("input-name").focus();
    return;
  }
  if (state.pair.code && state.pair.role === "owner") {
    updateStartPairPanel();
    showStartFeedback("Код уже есть — отправь его партнёру ниже.", { ok: true });
    el("start-code-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }
  const partnerCode = normalizeCodeInput(el("input-partner-code").value);
  if (partnerCode) {
    showStartFeedback(
      "Ты ввёл код партнёра — нажми «Начать анкету», чтобы присоединиться, а не создавай новый код.",
      { useError: true },
    );
    return;
  }

  const prevLabel = btn?.textContent || "Создать код пары";
  if (btn) {
    btn.disabled = true;
    btn.classList.add("busy");
    btn.textContent = "Создаём код…";
  }

  try {
    const created = await apiPair({ action: "create", display_name: name });
    const code = created.data?.pair?.code;
    if (!created.ok || !code) {
      const detail = created.data?.error ? ` (${created.data.error})` : "";
      showStartFeedback(
        `Не удалось создать код${detail}. Проверь интернет и обнови страницу (Ctrl+F5).`,
        { useError: true },
      );
      return;
    }
    state.displayName = name;
    state.pair.code = code;
    state.pair.role = "owner";
    savePairLocal();
    saveLocal();
    updateStartPairPanel();
    showStartFeedback("Готово! Отправь партнёру код или ссылку ниже.", { ok: true });
    el("start-code-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch {
    showStartFeedback("Ошибка сети при создании кода — попробуй ещё раз.", { useError: true });
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove("busy");
      btn.textContent = prevLabel;
    }
  }
}

async function startForm() {
  const name = el("input-name").value.trim();
  const err = el("start-error");
  err.classList.add("hidden");

  if (!name) {
    err.textContent = "Укажи имя — так отличим твою анкету от анкеты партнёра";
    err.classList.remove("hidden");
    return;
  }

  const partnerCode = normalizeCodeInput(el("input-partner-code").value);
  state.displayName = name;

  if (partnerCode) {
    const check = await fetchPairStatus(partnerCode);
    if (!check) {
      err.textContent = "Код не найден. Проверь буквы/цифры или попроси партнёра создать новый.";
      err.classList.remove("hidden");
      return;
    }
    const joined = await apiPair({
      action: "join",
      code: partnerCode,
      display_name: name,
    });
    if (!joined.ok) {
      err.textContent =
        joined.data?.error === "partner_taken"
          ? "По этому коду уже записан другой партнёр."
          : "Не удалось привязаться по коду.";
      err.classList.remove("hidden");
      return;
    }
    state.pair.code = partnerCode;
    state.pair.role = "partner";
    stripJoinFromUrl();
  } else if (!state.pair.code) {
    const created = await apiPair({ action: "create", display_name: name });
    if (created.ok && created.data.pair?.code) {
      state.pair.code = created.data.pair.code;
      state.pair.role = "owner";
      updateStartPairPanel();
    }
  } else if (!state.pair.role) {
    state.pair.role = "owner";
  }

  savePairLocal();
  el("form-subtitle").textContent = `Анкета: ${name}${state.pair.code ? ` · код пары ${state.pair.code}` : ""}`;
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
  if (result === "age_invalid") {
    err.textContent = "Укажи возраст числом — от 16 до 99";
    err.classList.remove("hidden");
    return;
  }
  if (result === null || result === "") {
    err.textContent = "Отметь хотя бы один пункт или напиши свой вариант в поле ниже";
    err.classList.remove("hidden");
    return;
  }
  saveLocal();

  if (state.step >= allSteps().length - 1) {
    showView("done");
    renderDone();
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

function mapDurationBack(block) {
  const d = block?.duration;
  if (d && typeof d === "object" && d.selected) return d;
  const label = block?.duration_label;
  if (!label) return "";
  if (label.includes("меньше")) return { selected: ["less_year"], custom: "" };
  if (label.includes("1-3")) return { selected: ["1-3"], custom: "" };
  if (label.includes("больше")) return { selected: ["more_3"], custom: "" };
  return { selected: ["prefer_not"], custom: "" };
}

function mapLivingBack(block) {
  const l = block?.living;
  if (l && typeof l === "object" && l.selected) return l;
  const v = block?.living_together;
  if (v === true) return { selected: ["yes"], custom: "" };
  if (v === false) return { selected: ["no"], custom: "" };
  return { selected: ["sometimes"], custom: "" };
}

function importFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const q = data.questionnaire || data;
      state.displayName = data.display_name || data.displayName || state.displayName;
      state.answers.intro = { ...(q.intro || {}) };
      state.answers.nicknames = { ...(q.nicknames || {}) };
      state.answers.blockA = { ...(q.block_a || {}) };
      const bb = q.block_b || {};
      state.answers.blockB = {
        B1_duration: mapDurationBack(bb.B1_duration_cohabitation),
        B1_living: mapLivingBack(bb.B1_duration_cohabitation),
        B2_frequent_disagreements: bb.B2_frequent_disagreements,
        B3_missing_now: bb.B3_missing_now,
        B4_partner_strengths: bb.B4_partner_strengths,
        B5_improve_one_month: bb.B5_improve_one_month,
      };
      if (data.pair_code) {
        state.pair.code = normalizeCodeInput(data.pair_code);
        state.pair.role = data.pair_role || state.pair.role;
      }
      saveLocal();
      alert("Анкета загружена из файла");
    } catch {
      alert("Не удалось прочитать JSON");
    }
  };
  reader.readAsText(file);
}

function init() {
  loadLocal();
  loadPairLocal();
  repairPairState();

  const join = parseJoinFromUrl();
  if (join) {
    el("input-partner-code").value = join;
    if (!state.pair.code) state.pair.role = "partner";
  }

  if (state.displayName) el("input-name").value = state.displayName;
  if (join) {
    el("input-partner-code").value = join;
  } else if (state.pair.role === "partner" && state.pair.code) {
    el("input-partner-code").value = state.pair.code;
  }
  updateStartPairPanel();

  el("input-partner-code").addEventListener("input", (e) => {
    e.target.value = normalizeCodeInput(e.target.value);
  });

  if (isQuestionnaireComplete()) {
    el("btn-start-translator")?.classList.remove("hidden");
  }
  el("btn-begin").addEventListener("click", () => {
    startForm();
  });
  el("btn-start-translator")?.addEventListener("click", () => {
    showView("translate");
    void renderTranslator();
  });
  el("btn-gen-code")?.addEventListener("click", () => {
    void generatePairCode();
  });
  el("btn-next").addEventListener("click", nextStep);
  el("btn-back").addEventListener("click", prevStep);
  el("btn-download").addEventListener("click", downloadJson);
  el("btn-save-server")?.addEventListener("click", saveToServer);
  el("btn-restart").addEventListener("click", () => {
    state.step = 0;
    showView("form");
    renderQuestion();
  });
  el("btn-open-translator")?.addEventListener("click", () => {
    showView("translate");
    void renderTranslator();
  });
  el("tab-form")?.addEventListener("click", () => {
    state.step = 0;
    showView("form");
    renderQuestion();
  });
  el("tab-translate")?.addEventListener("click", () => {
    if (!isQuestionnaireComplete()) {
      showView("form");
      renderQuestion();
      return;
    }
    showView("translate");
    void renderTranslator();
  });
  el("btn-translate")?.addEventListener("click", () => void runTranslate(""));
  el("btn-clarify")?.addEventListener("click", () => void runTranslate(el("input-clarify").value.trim()));
  el("btn-new-person").addEventListener("click", () => {
    state.answers = emptyAnswers();
    state.step = 0;
    state.displayName = "";
    state.pair = { code: "", role: "" };
    el("input-name").value = "";
    el("input-partner-code").value = "";
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PAIR_STORAGE_KEY);
    el("start-code-panel").classList.add("hidden");
    showView("start");
    updateTabs();
  });

  el("btn-copy-start-code")?.addEventListener("click", () =>
    copyText(state.pair.code, el("start-pair-msg"), "Код скопирован"),
  );
  el("btn-copy-start-link")?.addEventListener("click", () =>
    copyText(inviteUrl(state.pair.code), el("start-pair-msg"), "Ссылка скопирована"),
  );
  el("btn-copy-done-code")?.addEventListener("click", () =>
    copyText(el("done-invite-code").textContent, el("done-pair-status"), "Код скопирован"),
  );
  el("btn-copy-done-link")?.addEventListener("click", () =>
    copyText(el("done-invite-link").textContent, el("done-pair-status"), "Ссылка скопирована"),
  );

  el("import-file").addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) importFile(f);
  });
  updateTabs();
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function renderHistory(turns) {
  const box = el("dialog-history");
  if (!box) return;
  if (!turns.length) {
    box.innerHTML = `<p class="dialog-empty">Пока пусто — напиши, что хочешь сказать, и появится память диалогов.</p>`;
    return;
  }
  box.innerHTML = turns
    .slice()
    .reverse()
    .map(
      (t) => `
      <article class="turn">
        <p class="draft">Ты: ${escapeHtml(t.draft || "")}</p>
        <p class="said">${escapeHtml(t.translated || "")}</p>
        <time>${escapeHtml(formatTime(t.at))}</time>
      </article>`,
    )
    .join("");
}

async function fetchPartnerContext() {
  if (!state.pair.code || !state.pair.role) return null;
  try {
    const { ok, data } = await apiPair({
      action: "translate_context",
      code: state.pair.code,
      role: state.pair.role,
    });
    if (!ok) return null;
    if (Array.isArray(data.dialog) && data.dialog.length) {
      saveDialog(data.dialog, pairDialogId());
    }
    if (data.recipient) {
      state.partnerProfile = sanitizeRecipient(data.recipient);
    }
    return data;
  } catch {
    return null;
  }
}

async function renderTranslator() {
  const ctx = await fetchPartnerContext();
  const sender = senderProfile();
  const recipient = state.partnerProfile;
  const nick = callPartnerAs(sender, recipient);
  el("translate-who").innerHTML = `Для <span class="nick-tag">${escapeHtml(nick)}</span>`;
  if (ctx?.recipient) {
    el("translate-partner-status").textContent = `Учитываем анкету ${ctx.recipient.display_name || "партнёра"}: тон, триггеры и то, как вас зовут.`;
  } else if (state.pair.code) {
    el("translate-partner-status").textContent =
      "Ждём анкету партнёра по коду пары. Пока перевод будет мягким, но уже с вашим обращением.";
  } else {
    el("translate-partner-status").textContent = "Свяжитесь кодом пары — тогда перевод возьмёт стиль партнёра.";
  }
  renderHistory(loadDialog(pairDialogId()));
  updateTabs();
}

function showResult(result) {
  state.lastResult = result;
  const card = el("result-card");
  const clarify = el("clarify-card");
  if (result.clarification_needed) {
    card.classList.add("hidden");
    clarify.classList.remove("hidden");
    el("clarify-question").textContent = result.clarification_question;
    el("input-clarify").value = "";
    el("input-clarify").focus();
    return;
  }
  clarify.classList.add("hidden");
  card.classList.remove("hidden");
  const rec = result.recommended || "primary";
  el("result-meta").textContent = [result.emotion, result.need, result.styleNotes].filter(Boolean).join(" · ");
  const variants = [
    { key: "primary", label: "Основной" },
    { key: "variant_b", label: "Мягче" },
    { key: "variant_a", label: "Прямее" },
  ].filter((v) => result.messages?.[v.key]);
  el("result-variants").innerHTML = variants
    .map((v) => {
      const recClass = v.key === rec ? " recommended" : "";
      const recLabel = v.key === rec ? " · рекомендуется" : "";
      return `
        <div class="variant-card${recClass}">
          <p class="variant-label">${v.label}${recLabel}</p>
          <p class="variant-text">${escapeHtml(result.messages[v.key])}</p>
          <div class="nav-row">
            <button type="button" class="secondary btn-copy-variant" data-text="${escapeAttr(result.messages[v.key])}">Скопировать</button>
          </div>
        </div>`;
    })
    .join("");
  el("result-variants").querySelectorAll(".btn-copy-variant").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.text || "");
        btn.textContent = "Скопировано";
      } catch {
        btn.textContent = "Не вышло — выдели вручную";
      }
    });
  });
}

async function persistTurn(turn) {
  const turns = appendTurn(turn, pairDialogId());
  if (!state.pair.code || !state.pair.role) return turns;
  try {
    await apiPair({
      action: "save_turn",
      code: state.pair.code,
      role: state.pair.role,
      turn,
    });
  } catch {
    /* local memory already saved */
  }
  return turns;
}

async function runTranslate(clarify = "") {
  const err = el("translate-error");
  err.classList.add("hidden");
  const draft = (el("input-tell").value || "").trim();
  if (!draft) {
    err.textContent = "Напиши, что хочешь сказать";
    err.classList.remove("hidden");
    return;
  }

  let result = null;
  if (state.pair.code && state.pair.role) {
    try {
      const { ok, data } = await apiPair({
        action: "translate",
        code: state.pair.code,
        role: state.pair.role,
        draft,
        clarify,
      });
      if (ok && data.result) result = data.result;
    } catch {
      /* fallback to local engine */
    }
  }
  if (!result) {
    result = translateFeelings({
      draft,
      sender: senderProfile(),
      recipient: state.partnerProfile,
      history: loadDialog(pairDialogId()),
      clarify,
    });
  }
  showResult(result);
  if (!result.clarification_needed && result.messages?.primary) {
    await persistTurn({
      draft,
      translated: result.messages[result.recommended] || result.messages.primary,
      emotion: result.emotion,
      nick: result.nick,
    });
    renderHistory(loadDialog(pairDialogId()));
  }
}

init();