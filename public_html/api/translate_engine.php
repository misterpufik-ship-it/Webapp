<?php
declare(strict_types=1);

function translate_selected($value): array
{
    if ($value === null || $value === '') {
        return [];
    }
    if (is_array($value)) {
        if (isset($value['selected']) && is_array($value['selected'])) {
            return array_map('strval', $value['selected']);
        }
        $keys = array_keys($value);
        if ($keys === range(0, count($value) - 1)) {
            return array_map('strval', $value);
        }
        if (isset($value['value'])) {
            return [(string) $value['value']];
        }
    }
    return [(string) $value];
}

function translate_text($value): string
{
    if (is_string($value)) {
        return trim($value);
    }
    if (is_array($value)) {
        return trim((string) ($value['custom'] ?? $value['other'] ?? $value['text'] ?? ''));
    }
    return '';
}

function translate_nicknames(?array $profile): array
{
    $q = is_array($profile['questionnaire'] ?? null) ? $profile['questionnaire'] : [];
    $n = $q['nicknames'] ?? ($profile['nicknames'] ?? []);
    return is_array($n) ? $n : [];
}

function translate_block_a(?array $profile): array
{
    $q = is_array($profile['questionnaire'] ?? null) ? $profile['questionnaire'] : [];
    $a = $q['block_a'] ?? [];
    return is_array($a) ? $a : [];
}

function translate_call_as(?array $sender, ?array $recipient): string
{
    $mine = translate_nicknames($sender)['call_partner'] ?? '';
    if (is_string($mine) && trim($mine) !== '') {
        return trim($mine);
    }
    $name = $recipient['display_name'] ?? ($recipient['displayName'] ?? '');
    return is_string($name) && $name !== '' ? $name : 'любимый человек';
}

function translate_sanitize_recipient(?array $profile): ?array
{
    if (!is_array($profile)) {
        return null;
    }
    $q = is_array($profile['questionnaire'] ?? null) ? $profile['questionnaire'] : [];
    $blockA = is_array($q['block_a'] ?? null) ? $q['block_a'] : [];
    unset($blockA['A6_hard_topics']);
    $blockB = [];
    if (isset($q['block_b']['B1_duration_cohabitation'])) {
        $blockB['B1_duration_cohabitation'] = $q['block_b']['B1_duration_cohabitation'];
    }
    $intro = is_array($q['intro'] ?? null) ? $q['intro'] : [];
    $nicks = is_array($q['nicknames'] ?? null) ? $q['nicknames'] : [];
    return [
        'display_name' => (string) ($profile['display_name'] ?? ''),
        'intro' => $intro,
        'nicknames' => $nicks,
        'questionnaire' => [
            'intro' => $intro,
            'block_a' => $blockA,
            'block_b' => $blockB,
            'nicknames' => $nicks,
        ],
    ];
}

function translate_style(?array $profile): array
{
    $a = translate_block_a($profile);
    $a2 = translate_selected($a['A2_request_style'] ?? null);
    $a3 = translate_selected($a['A3_love_signals'] ?? null);
    $a5 = translate_selected($a['A5_triggers'] ?? null);
    $a1 = translate_selected($a['A1_upset_need'] ?? null);
    $sensitive = in_array('criticism', $a5, true) || in_array('harsh_tone', $a5, true);
    $needsSoft = in_array('soft', $a2, true) || $sensitive;
    return [
        'prefersDirect' => in_array('direct', $a2, true) && !in_array('soft', $a2, true),
        'needsSoft' => $needsSoft,
        'lovesTime' => in_array('time_together', $a3, true),
        'lovesWords' => in_array('words', $a3, true),
        'lovesTouch' => in_array('touch', $a3, true),
        'lovesActs' => in_array('acts', $a3, true) || in_array('help', $a3, true),
        'wantsListen' => in_array('listen', $a1, true),
        'wantsHug' => in_array('hug', $a1, true),
        'wantsSpace' => in_array('space', $a1, true),
        'wantsCalm' => in_array('calm', translate_selected($a['A8_communication_goal'] ?? null), true),
        'conflict' => translate_selected($a['A4_conflict_style'] ?? null)[0] ?? '',
        'triggers' => $a5,
        'supportExample' => translate_text($a['A7_support_example'] ?? null),
    ];
}

function translate_rewrite(string $draft): string
{
    $t = trim($draft);
    $map = [
        '/ты меня (совсем |вообще )?не (слышишь|слушаешь)/iu' => 'мне не хватает ощущения, что меня слышат',
        '/меня (совсем |вообще )?не (слышит|слушает)/iu' => 'мне не хватает ощущения, что меня слышат',
        '/ты никогда не/iu' => 'мне редко хватает того, что ты',
        '/ты всегда/iu' => 'мне часто бывает тяжело, когда ты',
        '/ты должен(?:а)?/iu' => 'мне было бы важно, если бы ты',
        '/\bбесит\b/iu' => 'мне сейчас очень тяжело из-за этого',
        '/мы никуда не ходим/iu' => 'мне не хватает времени вдвоём, когда мы куда-то выходим',
        '/только работает/iu' => 'кажется, что работе остаётся больше места, чем нам',
    ];
    foreach ($map as $re => $to) {
        $t = preg_replace($re, $to, $t) ?? $t;
    }
    $t = trim(preg_replace('/\s+/u', ' ', $t) ?? $t);
    if ($t === '') {
        $t = trim($draft);
    }
    if (!preg_match('/^(мне|я|хочу)/iu', $t)) {
        $t = 'мне важно сказать: ' . $t;
    }
    if (!preg_match('/[.!?…]$/u', $t)) {
        $t .= '.';
    }
    return mb_strtoupper(mb_substr($t, 0, 1)) . mb_substr($t, 1);
}

function translate_request(array $style, string $draft): string
{
    if ($style['supportExample'] !== '') {
        $s = rtrim($style['supportExample'], '.');
        return mb_strtolower(mb_substr($s, 0, 1)) . mb_substr($s, 1);
    }
    $low = mb_strtolower($draft);
    if ($style['lovesTime'] || preg_match('/время|ходим|вдвоём|вечера/u', $low)) {
        return 'на этой неделе выберем один вечер вдвоём — без телефонов';
    }
    if ($style['wantsHug'] || $style['lovesTouch']) {
        return 'просто обнимешь меня, без советов';
    }
    if ($style['wantsListen'] || $style['lovesWords']) {
        return 'выслушаешь меня до конца и скажешь, что услышал';
    }
    if ($style['wantsSpace'] || ($style['conflict'] ?? '') === 'pause') {
        return 'дадим паузу и вернёмся к разговору спокойно';
    }
    return 'ответишь, как тебе это слышится, и вместе выберем один маленький шаг';
}

function translate_wrap(string $nick, string $body, string $request, string $tone, string $continuity): string
{
    $name = $nick !== '' ? $nick . ', ' : '';
    $lead = $tone === 'soft'
        ? $name . 'хочу сказать тебе спокойно и без упрёка.'
        : ($tone === 'direct' ? $name . 'скажу прямо.' : $name . 'хочу, чтобы ты услышал(а) меня.');
    $ask = $tone === 'direct'
        ? 'Просьба: ' . $request . '.'
        : ($tone === 'soft' ? 'Мне будет тепло, если ' . $request . '.' : 'Моя просьба: ' . $request . '.');
    return $lead . "\n\n" . $continuity . $body . "\n\n" . $ask;
}

function translate_feelings(string $draft, ?array $sender, ?array $recipient, array $history = [], string $clarify = ''): array
{
    $text = trim($draft . ($clarify !== '' ? "\n" . $clarify : ''));
    $nick = translate_call_as($sender, $recipient);
    $flags = [];
    $low = mb_strtolower($text);
    if (preg_match('/угрож|кричит|бьёт|ударил|заткн/u', $low)) {
        $flags[] = 'abuse_suspected';
    }
    $myNick = translate_nicknames($sender)['partner_calls_me'] ?? '';

    if (in_array('abuse_suspected', $flags, true)) {
        $msg = ($nick !== '' ? $nick . ', ' : '') . 'мне неприемлемо, когда во время ссоры повышают голос или угрожают. Мне нужна пауза и разговор без угроз.';
        return [
            'emotion' => 'Страх и потребность в безопасности',
            'need' => 'Обозначить границу',
            'clarification_needed' => false,
            'messages' => ['primary' => $msg, 'variant_a' => $msg, 'variant_b' => $msg],
            'recommended' => 'primary',
            'actions' => ['Взять паузу'],
            'styleNotes' => 'Граница без сглаживания',
            'safety_flags' => $flags,
            'nick' => $nick,
            'myNick' => $myNick,
        ];
    }

    if ($clarify === '' && (mb_strlen($text) < 12 || preg_match('/^(бесит|злюсь|плохо|устала|устал|обидно)\.?$/u', $text))) {
        return [
            'emotion' => '',
            'need' => '',
            'clarification_needed' => true,
            'clarification_question' => 'Что именно произошло и что ты хочешь, чтобы партнёр понял или сделал?',
            'messages' => new stdClass(),
            'actions' => [],
            'styleNotes' => '',
            'safety_flags' => $flags,
            'nick' => $nick,
            'myNick' => $myNick,
        ];
    }

    $style = $recipient ? translate_style($recipient) : ['needsSoft' => true, 'prefersDirect' => false, 'triggers' => [], 'supportExample' => '', 'lovesTime' => false, 'lovesWords' => false, 'lovesTouch' => false, 'wantsHug' => false, 'wantsListen' => false, 'wantsSpace' => false, 'wantsCalm' => false, 'conflict' => ''];
    $body = translate_rewrite($text);
    $request = translate_request($style, $text);
    $continuity = '';
    $tone = ($style['needsSoft'] && empty($style['prefersDirect'])) ? 'soft' : (!empty($style['prefersDirect']) ? 'direct' : 'balanced');
    $primary = translate_wrap($nick, $body, $request, $tone, $continuity);
    $rec = $tone === 'direct' ? 'variant_a' : ($tone === 'soft' ? 'variant_b' : 'primary');

    return [
        'emotion' => preg_match('/слыш|вниман/u', $low) ? 'Ощущение, что тебя не слышат' : 'Чувства, которые хочется донести бережно',
        'need' => !empty($style['lovesTime']) ? 'Совместное время и внимание' : 'Быть услышанным',
        'clarification_needed' => false,
        'messages' => [
            'primary' => $primary,
            'variant_a' => translate_wrap($nick, $body, $request, 'direct', $continuity),
            'variant_b' => translate_wrap($nick, $body, $request, 'soft', $continuity),
        ],
        'recommended' => $rec,
        'actions' => [mb_strtoupper(mb_substr($request, 0, 1)) . mb_substr($request, 1)],
        'styleNotes' => 'Обращение: ' . $nick,
        'safety_flags' => $flags,
        'nick' => $nick,
        'myNick' => $myNick,
    ];
}

function translate_openai_if_possible(string $draft, ?array $sender, ?array $recipient, array $history, string $clarify): ?array
{
    $config = function_exists('app_db_config') ? app_db_config() : null;
    $key = is_array($config) ? (string) ($config['openai_api_key'] ?? '') : '';
    if ($key === '') {
        $key = (string) (getenv('OPENAI_API_KEY') ?: '');
    }
    if ($key === '') {
        return null;
    }
    $model = is_array($config) ? (string) ($config['openai_model'] ?? 'gpt-4.1-mini') : 'gpt-4.1-mini';
    $nick = translate_call_as($sender, $recipient);
    $myNick = translate_nicknames($sender)['partner_calls_me'] ?? '';
    $recipientSafe = translate_sanitize_recipient($recipient);
    $historyBits = array_map(static function ($t) {
        return ['draft' => $t['draft'] ?? '', 'translated' => $t['translated'] ?? ''];
    }, array_slice($history, -8));

    $payload = [
        'model' => $model,
        'response_format' => ['type' => 'json_object'],
        'messages' => [
            [
                'role' => 'system',
                'content' => 'Ты переводчик чувств для пары. Не судья и не терапевт. Не используй стереотипы по полу. Знак зодиака не используй в тексте. Называй получателя личным обращением. Ответ строго JSON: emotion, need, clarification_needed, clarification_question, messages{primary,variant_a,variant_b}, recommended, actions, styleNotes, safety_flags, nick.',
            ],
            [
                'role' => 'user',
                'content' => json_encode([
                    'draft' => $draft,
                    'clarify' => $clarify,
                    'address_as' => $nick,
                    'sender_called' => $myNick,
                    'recipient_style' => $recipientSafe,
                    'dialog_memory' => $historyBits,
                ], JSON_UNESCAPED_UNICODE),
            ],
        ],
    ];

    $ch = curl_init('https://api.openai.com/v1/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $key,
        ],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 25,
    ]);
    $raw = curl_exec($ch);
    curl_close($ch);
    if (!is_string($raw) || $raw === '') {
        return null;
    }
    $decoded = json_decode($raw, true);
    $content = $decoded['choices'][0]['message']['content'] ?? '';
    $result = json_decode((string) $content, true);
    if (!is_array($result) || empty($result['messages'])) {
        return null;
    }
    $result['nick'] = $result['nick'] ?? $nick;
    $result['myNick'] = $result['myNick'] ?? $myNick;
    return $result;
}
