const DIALOG_KEY = "couples_translator_dialog_v1";
const PARTNER_KEY = "couples_translator_partner_v1";

export function selectedOf(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "object") {
    if (Array.isArray(value.selected)) return value.selected.map(String);
    if (value.value) return [String(value.value)];
    if (value.other) return ["other"];
  }
  if (typeof value === "string" && value) return [value];
  return [];
}

export function textOf(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    return String(value.custom || value.other || value.text || "").trim();
  }
  return String(value).trim();
}

function blockA(profile) {
  return profile?.questionnaire?.block_a || profile?.answers?.blockA || {};
}

function introOf(profile) {
  return profile?.questionnaire?.intro || profile?.answers?.intro || profile?.intro || {};
}

export function nicknamesOf(profile) {
  return profile?.questionnaire?.nicknames || profile?.answers?.nicknames || profile?.nicknames || {};
}

export function deriveStyle(profile) {
  const a = blockA(profile);
  const a2 = selectedOf(a.A2_request_style);
  const a3 = selectedOf(a.A3_love_signals);
  const a5 = selectedOf(a.A5_triggers);
  const a1 = selectedOf(a.A1_upset_need);
  const a8 = selectedOf(a.A8_communication_goal);
  const prefersDirect = a2.includes("direct") && !a2.includes("soft");
  const sensitive = a5.includes("criticism") || a5.includes("harsh_tone");
  const needsSoft = a2.includes("soft") || sensitive;
  return {
    prefersDirect,
    sensitive,
    needsSoft,
    lovesTime: a3.includes("time_together"),
    lovesWords: a3.includes("words"),
    lovesTouch: a3.includes("touch"),
    lovesActs: a3.includes("acts") || a3.includes("help"),
    wantsListen: a1.includes("listen"),
    wantsHug: a1.includes("hug"),
    wantsSpace: a1.includes("space"),
    wantsAdvice: a1.includes("advice"),
    wantsTenderness: a8.includes("tenderness"),
    wantsCalm: a8.includes("calm"),
    wantsHumor: a8.includes("humor"),
    conflict: selectedOf(a.A4_conflict_style)[0] || "",
    triggers: a5,
    supportExample: textOf(a.A7_support_example),
    customA2: textOf(a.A2_request_style),
  };
}

export function callPartnerAs(sender, recipient) {
  const mine = nicknamesOf(sender).call_partner;
  if (mine) return mine;
  return recipient?.display_name || recipient?.displayName || "любимый человек";
}

export function iAmCalled(sender, recipient) {
  return nicknamesOf(sender).partner_calls_me || nicknamesOf(recipient).call_partner || sender?.display_name || "";
}

function detectSafety(draft) {
  const t = draft.toLowerCase();
  const flags = [];
  if (/(угрож|кричит|бьёт|ударил|заткн)/i.test(t)) flags.push("abuse_suspected");
  if (/вину/.test(t) && /чтобы (он|она|ты)/.test(t)) flags.push("manipulation_request");
  return flags;
}

function rewriteToIMessage(draft) {
  let t = draft.trim();
  const pairs = [
    [/ты меня (совсем |вообще )?не (слышишь|слушаешь)/gi, "мне не хватает ощущения, что меня слышат"],
    [/меня (совсем |вообще )?не (слышит|слушает)/gi, "мне не хватает ощущения, что меня слышат"],
    [/ты никогда не/gi, "мне редко хватает того, что ты"],
    [/ты всегда/gi, "мне часто бывает тяжело, когда ты"],
    [/он всегда/gi, "мне часто бывает тяжело, когда"],
    [/она всегда/gi, "мне часто бывает тяжело, когда"],
    [/ты должен(?:а)?/gi, "мне было бы важно, если бы ты"],
    [/\bбесит\b/gi, "мне сейчас очень тяжело из-за этого"],
    [/достал[аи]?\b/gi, "мне тяжело это переживать"],
    [/мы никуда не ходим/gi, "мне не хватает времени вдвоём, когда мы куда-то выходим"],
    [/ты только работаешь/gi, "кажется, что работе остаётся больше места, чем нам"],
    [/только работа(ет|ешь)/gi, "кажется, что работе остаётся больше места, чем нам"],
    [/ты меня не любишь/gi, "мне сейчас не хватает тепла и близости"],
  ];
  for (const [re, to] of pairs) t = t.replace(re, to);
  t = t.replace(/\s+/g, " ").trim();
  if (!t) return draft.trim();
  if (!/^(мне|я|хочу|давай|мне бы)/i.test(t)) {
    t = `мне важно сказать: ${t}`;
  }
  if (!/[.!?…]$/.test(t)) t += ".";
  t = t.replace(/(^|[.!?]\s+)([а-яёa-z])/g, (_, a, b) => a + b.toUpperCase());
  return t;
}

function concreteRequest(style, draft) {
  if (style.supportExample) {
    const s = style.supportExample.replace(/[.]+$/, "");
    const lower = `${s[0].toLowerCase()}${s.slice(1)}`;
    if (/^выслушать/i.test(lower)) return "ты выслушаешь меня без советов";
    if (/^обнять/i.test(lower)) return "ты просто обнимешь меня";
    return lower;
  }
  const low = draft.toLowerCase();
  if (style.lovesTime || /время|ходим|вдвоём|вечера|свидан/.test(low)) {
    return "на этой неделе выберем один вечер вдвоём — без телефонов";
  }
  if (style.wantsHug || style.lovesTouch) {
    return "просто обнимешь меня, без советов";
  }
  if (style.wantsListen || style.lovesWords) {
    return "выслушаешь меня до конца и скажешь, что услышал";
  }
  if (style.wantsSpace || style.conflict === "pause") {
    return "дадим паузу и вернёмся к разговору спокойно";
  }
  if (style.lovesActs) {
    return "сделаешь одно конкретное действие, о котором договоримся";
  }
  return "ответишь, как тебе это слышится, и вместе выберем один маленький шаг";
}

function isVague(draft) {
  const t = draft.trim();
  if (t.length < 12) return true;
  return /^(бесит|злюсь|достал[аи]?|ненавижу|плохо|устала|устал|обидно)\.?$/i.test(t);
}

function relatedToHistory(draft, history) {
  if (!history?.length) return "";
  const last = history[history.length - 1];
  const prev = `${last.draft || ""} ${last.translated || ""}`.toLowerCase();
  const now = draft.toLowerCase();
  const keys = ["время", "работ", "слыш", "вечер", "деньг", "быт", "мам", "пап", "секс", "близост", "вдвоём"];
  const hit = keys.find((k) => prev.includes(k) && now.includes(k));
  if (!hit) return "";
  return "Продолжая то, о чём уже говорили: ";
}

function wrapMessage(nick, body, request, tone, continuity) {
  const name = nick ? `${nick}, ` : "";
  const lead =
    tone === "soft"
      ? `${name}хочу сказать тебе спокойно и без упрёка.`
      : tone === "direct"
        ? `${name}скажу прямо.`
        : `${name}хочу, чтобы ты услышал(а) меня.`;
  const ask =
    tone === "direct"
      ? `Просьба: ${request}.`
      : tone === "soft"
        ? `Мне будет тепло, если ${request}.`
        : `Моя просьба: ${request}.`;
  return `${lead}\n\n${continuity}${body}\n\n${ask}`;
}

export function translateFeelings({ draft, sender, recipient, history = [], clarify = "" }) {
  const text = [draft, clarify].filter(Boolean).join("\n").trim();
  const flags = detectSafety(text);
  const nick = callPartnerAs(sender, recipient);
  const myNick = iAmCalled(sender, recipient);
  const style = recipient ? deriveStyle(recipient) : { needsSoft: true, prefersDirect: false, triggers: [] };
  const recipientIntro = introOf(recipient);

  if (flags.includes("abuse_suspected")) {
    const msg = `${nick ? `${nick}, ` : ""}мне неприемлемо, когда во время ссоры повышают голос или угрожают. Мне нужна пауза и разговор без угроз.`;
    return {
      emotion: "Страх и потребность в безопасности",
      need: "Обозначить границу",
      clarification_needed: false,
      messages: {
        primary: msg,
        variant_a: msg,
        variant_b: `${nick ? `${nick}, ` : ""}мне сейчас небезопасен этот тон. Я останавливаю разговор и вернусь, когда можно говорить спокойно.`,
      },
      actions: ["Взять паузу", "Говорить только без угроз"],
      styleNotes: "Граница без сглаживания",
      safety_flags: flags,
      nick,
      myNick,
    };
  }

  if (isVague(text) && !clarify) {
    return {
      emotion: "",
      need: "",
      clarification_needed: true,
      clarification_question: "Что именно произошло и что ты хочешь, чтобы партнёр понял или сделал?",
      messages: {},
      actions: [],
      styleNotes: "",
      safety_flags: flags,
      nick,
      myNick,
    };
  }

  const body = rewriteToIMessage(text);
  const request = concreteRequest(style, text);
  const continuity = relatedToHistory(text, history);
  const avoid = [];
  if (style.triggers.includes("criticism")) avoid.push("без оценки");
  if (style.triggers.includes("harsh_tone")) avoid.push("без резкости");
  if (style.triggers.includes("comparison")) avoid.push("без сравнений");
  if (style.triggers.includes("control")) avoid.push("как просьба, не контроль");

  const primaryTone = style.needsSoft && !style.prefersDirect ? "soft" : style.prefersDirect ? "direct" : "balanced";
  const primary = wrapMessage(nick, body, request, primaryTone, continuity);
  const variantA = wrapMessage(nick, body, request, "direct", continuity);
  const variantB = wrapMessage(nick, body, request, "soft", continuity);

  const emotion = /слыш|вниман|игнор/.test(text.toLowerCase())
    ? "Ощущение, что тебя не слышат"
    : /врем|вдвоём|работ/.test(text.toLowerCase())
      ? "Тоска по близости и общему времени"
      : "Смешанные чувства, которые хочется донести бережно";

  return {
    emotion,
    need: style.lovesTime ? "Совместное время и внимание" : "Быть услышанным и встретить понятный отклик",
    clarification_needed: false,
    messages: {
      primary,
      variant_a: variantA,
      variant_b: variantB,
    },
    recommended: primaryTone === "direct" ? "variant_a" : primaryTone === "soft" ? "variant_b" : "primary",
    actions: [
      request.charAt(0).toUpperCase() + request.slice(1),
      style.wantsCalm ? "Говорить спокойнее и короче" : "Спросить, как это услышалось",
    ].filter(Boolean),
    styleNotes: [
      `Обращение: ${nick}`,
      myNick ? `тебя партнёр зовёт: ${myNick}` : "",
      avoid.length ? `учитываем: ${avoid.join(", ")}` : "",
      recipientIntro.zodiac && recipientIntro.zodiac !== "prefer_not" ? "знак зодиака только в профиле, не в тексте" : "",
    ]
      .filter(Boolean)
      .join(" · "),
    safety_flags: flags,
    nick,
    myNick,
  };
}

export function dialogStorageId(pairCode, role) {
  return pairCode ? `${pairCode}:${role || "me"}` : "local";
}

export function loadDialog(pairId = "local") {
  try {
    const raw = localStorage.getItem(`${DIALOG_KEY}:${pairId}`);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data.turns) ? data.turns : [];
  } catch {
    return [];
  }
}

export function saveDialog(turns, pairId = "local") {
  localStorage.setItem(
    `${DIALOG_KEY}:${pairId}`,
    JSON.stringify({ turns: turns.slice(-40), updatedAt: new Date().toISOString() }),
  );
}

export function appendTurn(turn, pairId = "local") {
  const turns = loadDialog(pairId);
  turns.push({ id: crypto.randomUUID?.() || String(Date.now()), at: new Date().toISOString(), ...turn });
  saveDialog(turns, pairId);
  return turns;
}

export function loadPartnerProfile() {
  try {
    const raw = localStorage.getItem(PARTNER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function savePartnerProfile(profile) {
  localStorage.setItem(PARTNER_KEY, JSON.stringify(profile));
}

export function sanitizeRecipient(profile) {
  if (!profile) return null;
  const q = profile.questionnaire || {};
  const block_a = { ...(q.block_a || {}) };
  delete block_a.A6_hard_topics;
  const block_b = {};
  if (q.block_b?.B1_duration_cohabitation) {
    block_b.B1_duration_cohabitation = q.block_b.B1_duration_cohabitation;
  }
  return {
    display_name: profile.display_name || profile.displayName || "",
    intro: q.intro || profile.intro || {},
    nicknames: q.nicknames || profile.nicknames || {},
    questionnaire: {
      block_a,
      block_b,
      intro: q.intro || profile.intro || {},
      nicknames: q.nicknames || profile.nicknames || {},
    },
  };
}
