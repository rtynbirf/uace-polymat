// ==UserScript==
// @name         UACE TXT-EXPORT — Экспорт страницы в текст (ПОЛИГОН)
// @namespace    local.universal.ai.exporter
// @version      1.0.0
// @description  ПОЛИГОН ОДНОЙ ФУНКЦИИ (доводим до релиза): экспорт ТЕКУЩЕЙ страницы в .txt на ВСЕХ сайтах и ВСЕХ страницах. Одна горячая клавиша Alt+T или чёрно-золотая пилюля «TXT» справа внизу: выбор основного контейнера по уликам (main/article/role=main/плотность), обход блоков (заголовки/абзацы/списки/таблицы/pre/цитаты), гигиена шума (script/style/nav/footer/aside/ARIA-роли/скрытые), Shadow DOM без границ, дедупликация длинных повторов, честная статистика (символы/слова/блоки/дубликаты/время захвата), FNV-1a 32 целостность, бюджет узлов/времени с честной обрезкой. 0 внешних запросов (0 сеть), никаких заглушек: кнопка РЕАЛЬНО сохраняет .txt. Журнал [TXT] кольцо 200, selftest чистого ядра. Л0-ядро Node-тестируемое (window.__UACE_TXT__).
// @author       POLYMAT (полигон функции из UACE × PML — POLYMAT UNIFIED v34.3.2)
// @match        *://*/*
// @match        file:///*
// @grant        none
// @noframes
// @run-at       document-idle
// ==/UserScript==
(function () {
  'use strict';

  /* ============================================================================
   * UACE TXT-EXPORT v1.0.0 · ПОЛИГОН ОДНОЙ ФУНКЦИИ
   * ----------------------------------------------------------------------------
   * КАНОН ЛИНИИ (от владельца):
   *   «БУДЕМ КАЖДУЮ ФУНКЦИЮ СКРИПТА, НАПРИМЕР ЭКСПОРТ ТЕКУЩЕЙ СТРАНИЦЫ В ТЕКСТ,
   *    ПИЛИТЬ ТОЛЬКО ЭТУ ФУНКЦИЮ ДО ИДЕАЛА!!! ЧТОБ НА ВСЕХ СТРАНИЦАХ НА ВСЕХ
   *    САЙТАХ ОТРАБАТЫВАЛО СО СКОРОСТЬЮ СВЕТА БЕЗ СУЧКА И ЗАДОРИНКИ».
   * ПРАВИЛА ПОЛИГОНА:
   *   1) ОДНА функция, никакого чужого кода; никакой интеграции в большой скрипт,
   *      пока функция не доведена до релиза (полигон → доказанный релиз → порт).
   *   2) Кнопка ИСПОЛНЯЕТ свою функцию по-настоящему: клик = реальный .txt файл.
   *      Никаких эмуляций, симуляций и заглушек (высший принцип владельца).
   *   3) 0 сеть: ни одного внешнего запроса; только локальная работа страницы.
   *   4) ЧЕСТНОСТЬ: всё, что снято/обрезано/пропущено — видно в статистике,
   *      предупреждениях и журнале [TXT]. Пустая страница → честный пустой файл
   *      с предупреждением, а НЕ выдуманный текст.
   *   5) СКОРОСТЬ: однопроходный обход, бюджеты узлов/времени, без MutationObserver,
   *      без таймеров; время захвата печатается в файл и журнал.
   *   6) Л0-ядро — чистые функции над переданным документом (Node/jsdom-тестируемые),
   *      страничная часть L1 — тонкий мост (hotkey + пилюля + скачивание).
   * ========================================================================== */

  var VER = '1.0.0';
  var JOURNAL_CAP = 200;          /* кольцо журнала [TXT] */
  var MAX_NODES = 30000;          /* бюджет узлов TreeWalker за захват */
  var MAX_BLOCKS = 8000;          /* бюджет блоков результата */
  var TIME_BUDGET_MS = 150;       /* мягкий бюджет времени одного захвата */
  var DEDUP_MIN_LEN = 40;         /* дедуп только длинных блоков (короткие легитимны) */

  /* ══════════════ L0 CORE — чистое ядро (Node/jsdom-тестируемое) ══════════════ */

  /* --- L0.1 FNV-1a 32 (хэш-канон PML §5: UTF-8 байты, hex8 lowercase) --- */
  var _enc = (typeof TextEncoder !== 'undefined') ? new TextEncoder() : null;
  function fnv1a32(str) {
    var bytes;
    if (_enc) { bytes = _enc.encode(String(str)); }
    else {
      bytes = [];
      var s = unescape(encodeURIComponent(String(str)));
      for (var i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i));
    }
    var h = 0x811c9dc5;
    for (var j = 0; j < bytes.length; j++) {
      h ^= bytes[j];
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    var hex = h.toString(16).toLowerCase();
    while (hex.length < 8) hex = '0' + hex;
    return hex;
  }

  /* --- L0.2 Классификаторы тегов (без DOM, чистые) --- */
  var NOISE_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'CANVAS', 'SVG', 'MATH',
    'OBJECT', 'EMBED', 'VIDEO', 'AUDIO', 'PICTURE', 'SOURCE', 'TRACK', 'MAP', 'AREA',
    'SELECT', 'OPTION', 'OPTGROUP', 'INPUT', 'TEXTAREA', 'BUTTON', 'LABEL', 'FORM',
    'FIELDSET', 'LEGEND', 'DATALIST', 'PROGRESS', 'METER', 'NAV', 'HEADER', 'FOOTER',
    'ASIDE', 'DIALOG', 'MENU', 'LINK', 'META', 'BASE', 'TITLE', 'HEAD'
  ]);
  var BLOCK_TAGS = new Set([
    'ADDRESS', 'ARTICLE', 'BLOCKQUOTE', 'CAPTION', 'DD', 'DETAILS', 'DIV', 'DL', 'DT',
    'FIGCAPTION', 'FIGURE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'MAIN', 'OL',
    'P', 'PRE', 'SECTION', 'SUMMARY', 'TABLE', 'TBODY', 'THEAD', 'TFOOT', 'TR',
    'TD', 'TH', 'UL', 'BODY', 'HTML'
  ]);
  var SKIP_ROLES = new Set([
    'navigation', 'banner', 'complementary', 'contentinfo', 'dialog', 'menu',
    'menubar', 'toolbar', 'search', 'alert', 'status', 'tooltip', 'progressbar'
  ]);

  function isNoiseTag(tag) { return NOISE_TAGS.has(String(tag || '').toUpperCase()); }
  function isBlockTag(tag) { return BLOCK_TAGS.has(String(tag || '').toUpperCase()); }

  /* ARIA/скрытость: роль из шумных, aria-hidden, [hidden], инлайн display:none.
     getComputedStyle — только как мягкая добавка (в Node/jsdom может отсутствовать). */
  function skipByAria(el, useComputed) {
    try {
      if (!el || el.nodeType !== 1) return true;
      var role = el.getAttribute && el.getAttribute('role');
      if (role && SKIP_ROLES.has(String(role).toLowerCase())) return true;
      if (el.getAttribute && (el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('hidden'))) return true;
      var st = (el.style && el.style.cssText) ? el.style.cssText.toLowerCase() : '';
      if (/display\s*:\s*none/.test(st) || /visibility\s*:\s*hidden/.test(st)) return true;
      if (useComputed && typeof el.ownerDocument !== 'undefined' && el.ownerDocument && el.ownerDocument.defaultView && el.ownerDocument.defaultView.getComputedStyle) {
        var cs = el.ownerDocument.defaultView.getComputedStyle(el);
        if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return true;
      }
    } catch (e) { /* честно игнорируем: решает остальная гигиена */ }
    return false;
  }

  /* --- L0.3 Свёртка пробелов (абзацы — одна строка) --- */
  function collapseWs(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  /* --- L0.4 ownText: текст ПРЯМЫХ узлов и инлайн-потомков; блок-потомки НЕ трогаем --- */
  function ownText(el) {
    var out = '';
    try {
      var doc = el.ownerDocument;
      if (!doc || !doc.createTreeWalker) {
        /* фоллбек без TreeWalker: только прямые текстовые дети */
        var kids = el.childNodes || [];
        for (var i = 0; i < kids.length; i++) {
          if (kids[i].nodeType === 3) out += kids[i].nodeValue;
        }
        return collapseWs(out);
      }
      var w = doc.createTreeWalker(el, 4 /* SHOW_TEXT */, {
        acceptNode: function (node) {
          var p = node.parentElement;
          if (!p) return 2 /* REJECT */;
          if (p !== el && isBlockTag(p.tagName)) return 2; /* текст уйдёт в свой блок */
          return 1 /* ACCEPT */;
        }
      });
      var n;
      while ((n = w.nextNode())) out += n.nodeValue;
    } catch (e) { /* honest: пусто */ }
    return collapseWs(out);
  }

  function hasBlockChild(el) {
    var kids = el.children || [];
    for (var i = 0; i < kids.length; i++) {
      if (isBlockTag(kids[i].tagName) && !isNoiseTag(kids[i].tagName)) return true;
    }
    return false;
  }

  function describeEl(el) {
    try {
      var s = String(el.tagName || '?').toLowerCase();
      if (el.id) s += '#' + String(el.id);
      if (el.className && typeof el.className === 'string') {
        var parts = el.className.trim().split(/\s+/).slice(0, 2).join('.');
        if (parts) s += '.' + parts;
      }
      return s.slice(0, 60);
    } catch (e) { return '?'; }
  }

  /* --- L0.5 Выбор основного контейнера ПО УЛИКАМ (Evidence First) ---
     Лестница стратегий: main → article → [role=main] → itemprop=articleBody →
     id/class-канон (#content/#main/.content) → плотность тел-level → body-fallback.
     Каждая улика с оценкой; победитель и топ-кандидаты уходят в шапку файла. */
  function quickLen(el) {
    try { return String(el.textContent || '').length; } catch (e) { return 0; }
  }

  function pickMainRoot(doc) {
    var cands = [];
    var seen = new Set();
    function push(el, strategy, base) {
      if (!el || el.nodeType !== 1 || seen.has(el)) return;
      if (isNoiseTag(el.tagName) || skipByAria(el, false)) return;
      seen.add(el);
      var len = quickLen(el);
      if (len < 80) return; /* пустой контейнер — не улика */
      var score = base + Math.min(len, 20000) / 20000 * 0.4;
      cands.push({ el: el, strategy: strategy, score: Math.min(score, 0.99), len: len, desc: describeEl(el) });
    }
    var dq = function (sel, strategy, base) {
      var list;
      try { list = doc.querySelectorAll(sel); } catch (e) { return; }
      var cap = Math.min(list.length, 8);
      for (var i = 0; i < cap; i++) push(list[i], strategy, base);
    };
    dq('main', 'main-selector', 0.50);
    dq('article', 'article-selector', 0.48);
    dq('[role="main"]', 'aria-main', 0.46);
    dq('[itemprop="articleBody"]', 'itemprop-body', 0.44);
    dq('#content', 'id-content', 0.30);
    dq('#main', 'id-main', 0.30);
    dq('.content', 'class-content', 0.28);

    /* плотность тел-level: крупнейший прямой ребёнок body (+1 уровень внутрь,
       если body — обёртка SPA). Дёшево: textContent только на десятках узлов. */
    var body = doc.body || doc.documentElement;
    try {
      var lvl1 = body.children || [];
      var best1 = null, bestLen = 0;
      for (var a = 0; a < lvl1.length; a++) {
        var e1 = lvl1[a];
        if (isNoiseTag(e1.tagName) || skipByAria(e1, false)) continue;
        var L1 = quickLen(e1);
        if (L1 > bestLen) { bestLen = L1; best1 = e1; }
      }
      if (best1 && bestLen >= 200) push(best1, 'density(body>1)', 0.36);
      if (best1 && best1.children && best1.children.length <= 40) {
        var lvl2 = best1.children, b2 = null, l2 = 0;
        for (var b = 0; b < lvl2.length; b++) {
          var e2 = lvl2[b];
          if (isNoiseTag(e2.tagName) || skipByAria(e2, false)) continue;
          var L2 = quickLen(e2);
          if (L2 > l2) { l2 = L2; b2 = e2; }
        }
        if (b2 && l2 >= 200) push(b2, 'density(body>1>1)', 0.34);
      }
    } catch (e) { /* honest: плотность недоступна */ }

    cands.sort(function (x, y) { return y.score - x.score; });
    var top = cands.slice(0, 3).map(function (c) { return c.strategy + ':' + c.desc + ':' + c.score.toFixed(2); });
    if (cands.length && cands[0].score >= 0.5) {
      return { root: cands[0].el, strategy: cands[0].strategy, desc: cands[0].desc, score: cands[0].score, candidates: top };
    }
    return {
      root: body, strategy: 'body-fallback', desc: describeEl(body),
      score: cands.length ? cands[0].score : 0,
      candidates: top,
      note: 'уверенного основного контейнера нет — взят body по честному фоллбеку'
    };
  }

  /* --- L0.6 Обход блоков: однопроходный, с бюджетами и Shadow DOM без границ --- */
  function makeCtx(opts) {
    opts = opts || {};
    return {
      nodes: 0, maxNodes: opts.maxNodes || MAX_NODES,
      blocks: [], maxBlocks: opts.maxBlocks || MAX_BLOCKS,
      t0: (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(),
      budgetMs: (opts.budgetMs === undefined) ? TIME_BUDGET_MS : opts.budgetMs,
      timeExceeded: false, nodesExceeded: false,
      dupes: 0, errors: 0,
      seen: new Set(),
      preText: null
    };
  }

  function ctxCheck(ctx) {
    if (ctx.timeExceeded || ctx.nodesExceeded) return false;
    if (ctx.nodes > ctx.maxNodes) { ctx.nodesExceeded = true; return false; }
    /* time-чек троттлится (каждые 512 узлов): performance.now() на каждом узле —
       лишний нагрев горячего цикла; счётчик узлов проверяется всегда (дёшево) */
    if ((ctx.nodes & 511) === 0) {
      if ((typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - ctx.t0 > ctx.budgetMs) {
        ctx.timeExceeded = true; return false;
      }
    }
    return true;
  }

  function pushBlock(ctx, kind, text, extra) {
    if (!text) return;
    if (ctx.blocks.length >= ctx.maxBlocks) { ctx.nodesExceeded = true; return; }
    if (text.length >= DEDUP_MIN_LEN) {
      var key = kind + '\u0000' + text;
      if (ctx.seen.has(key)) { ctx.dupes++; return; }
      ctx.seen.add(key);
    }
    var b = { kind: kind, text: text };
    if (extra) for (var k in extra) b[k] = extra[k];
    ctx.blocks.push(b);
  }

  function rowText(tr) {
    var cells = [];
    var kids = tr.children || [];
    for (var i = 0; i < kids.length; i++) {
      var tag = String(kids[i].tagName || '').toUpperCase();
      if (tag === 'TD' || tag === 'TH') cells.push(collapseWs(kids[i].textContent || ''));
    }
    return cells.join(' | ');
  }

  function collectBlocks(root, ctx, depth, quote) {
    if (!root || depth > 60) return;
    var kids = root.children || [];
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      ctx.nodes++;
      if (!ctxCheck(ctx)) return;
      var tag = String(el.tagName || '').toUpperCase();
      if (isNoiseTag(tag) || skipByAria(el, true)) continue;

      /* Shadow DOM: границ не боимся — свет и тень обходим одним алгоритмом */
      if (el.shadowRoot) { collectBlocks(el.shadowRoot, ctx, depth + 1, quote); }

      if (tag === 'PRE') {
        var pre = String(el.textContent || '').replace(/\s+$/g, '');
        if (pre) pushBlock(ctx, 'pre', pre);
        continue;
      }
      if (tag === 'TR') {
        var rt = rowText(el);
        if (rt) pushBlock(ctx, 'row', rt);
        continue;
      }
      if (tag === 'TABLE' || tag === 'THEAD' || tag === 'TBODY' || tag === 'TFOOT') {
        collectBlocks(el, ctx, depth + 1, quote);
        continue;
      }
      if (/^H[1-6]$/.test(tag)) {
        var ht = ownText(el);
        if (ht) pushBlock(ctx, 'h', ht, { level: parseInt(tag[1], 10) });
        continue;
      }
      if (tag === 'BLOCKQUOTE') {
        var qt = ownText(el);
        if (qt) pushBlock(ctx, 'quote', qt);
        collectBlocks(el, ctx, depth + 1, true);
        continue;
      }
      if (tag === 'FIGCAPTION') {
        var ft = ownText(el);
        if (ft) pushBlock(ctx, 'cap', ft);
        continue;
      }
      if (isBlockTag(tag)) {
        if (hasBlockChild(el)) {
          var own = ownText(el);
          if (own) pushBlock(ctx, tag === 'LI' ? 'li' : (quote ? 'quote' : 'p'), quote ? '> ' + own : own);
          collectBlocks(el, ctx, depth + 1, quote);
        } else {
          var t = ownText(el);
          if (t) {
            var kind = quote ? 'quote' : (tag === 'LI' ? 'li' : (tag === 'DD' || tag === 'DT' ? 'def' : 'p'));
            pushBlock(ctx, kind, quote ? '> ' + t : t);
          }
        }
        continue;
      }
      /* инлайн/прочее: текст соберётся блоком-предком (ownText) — сюда не лезем */
    }
  }

  /* --- L0.7 Формат тела: списки в группы, блоки через пустую строку --- */
  function formatBody(blocks) {
    var out = [];
    var prevKind = null;
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      var line;
      if (b.kind === 'h') line = (b.level <= 2 ? b.text.toUpperCase() : b.text);
      else if (b.kind === 'li') line = '\u2022 ' + b.text;
      else if (b.kind === 'row') line = b.text;
      else if (b.kind === 'quote') line = (b.text.indexOf('> ') === 0 ? b.text : '> ' + b.text);
      else if (b.kind === 'pre') line = b.text;
      else if (b.kind === 'cap') line = '[' + b.text + ']';
      else line = b.text;
      var sep = (out.length === 0) ? '' :
        (b.kind === 'li' && prevKind === 'li') ? '\n' : (b.kind === 'pre' || prevKind === 'pre') ? '\n\n' : '\n\n';
      out.push(sep + line);
      prevKind = b.kind;
    }
    return out.join('');
  }

  /* --- L0.8 Шапка файла (честная статистика + целостность) --- */
  function nf(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

  function buildPageText(pi, blocks, stats) {
    var body = formatBody(blocks);
    var lines = [];
    lines.push('=== UACE TXT-EXPORT \u00b7 СТРАНИЦА \u2192 ТЕКСТ ===');
    lines.push('URL: ' + (pi.url || '\u2014'));
    lines.push('Заголовок: ' + (pi.title || '\u2014'));
    lines.push('Хост: ' + (pi.host || '\u2014'));
    lines.push('Дата (UTC): ' + (pi.dateUtc || '\u2014'));
    lines.push('Основной контейнер: ' + (pi.rootDesc || '\u2014') + ' (стратегия: ' + (pi.strategy || '\u2014') + ', оценка ' + (pi.score === undefined ? '\u2014' : Number(pi.score).toFixed(2)) + ')');
    if (pi.candidates && pi.candidates.length) lines.push('Улики выбора: ' + pi.candidates.join(' \u00b7 '));
    if (pi.note) lines.push('Примечание: ' + pi.note);
    lines.push('Статистика: символов ' + nf(stats.chars) + ' \u00b7 слов ' + nf(stats.words) + ' \u00b7 блоков ' + nf(stats.blockCount) + ' \u00b7 дубликатов снято ' + nf(stats.dupes) + ' \u00b7 время ' + nf(stats.ms) + ' мс');
    lines.push('Целостность тела (FNV-1a 32): ' + fnv1a32(body));
    if (stats.warnings && stats.warnings.length) {
      for (var i = 0; i < stats.warnings.length; i++) lines.push('Предупреждение: ' + stats.warnings[i]);
    }
    lines.push('Движок: UACE TXT-EXPORT v' + VER + ' \u00b7 полигон функции \u00b7 0 сеть \u00b7 локально');
    lines.push('============================================================================');
    lines.push('');
    lines.push(body);
    return lines.join('\n');
  }

  /* --- L0.9 Имя файла: txt_YYYYMMDD-HHMMSS_host.txt (санитизация) --- */
  function buildFilename(host, title, d) {
    function pad(x) { return (x < 10 ? '0' : '') + x; }
    var t = d || new Date();
    var stamp = '' + t.getUTCFullYear() + pad(t.getUTCMonth() + 1) + pad(t.getUTCDate()) + '-' + pad(t.getUTCHours()) + pad(t.getUTCMinutes()) + pad(t.getUTCSeconds());
    var base = String(host || 'page').toLowerCase()
      .replace(/^www\./, '')
      .replace(/[^a-z0-9.\-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'page';
    return 'txt_' + stamp + '_' + base + '.txt';
  }

  /* --- L0.10 SELFTEST чистого ядра (12 проверок канона) --- */
  function selftest() {
    var res = [];
    function t(name, ok, info) { res.push({ name: name, ok: !!ok, info: info || '' }); }
    t('fnv1a32("a") == e40c292c', fnv1a32('a') === 'e40c292c', fnv1a32('a'));
    t('fnv1a32("") == 811c9dc5', fnv1a32('') === '811c9dc5', fnv1a32(''));
    t('fnv1a32 детерминизм', fnv1a32('UACE') === fnv1a32('UACE'));
    t('collapseWs', collapseWs('  a \n\t b  ') === 'a b', collapseWs('  a \n\t b  '));
    t('isNoiseTag', isNoiseTag('script') && !isNoiseTag('article'));
    t('isBlockTag', isBlockTag('p') && !isBlockTag('span'));
    t('имя файла: санитизация', buildFilename('www.Example.COM', 'x', new Date(Date.UTC(2026, 8, 23, 15, 40, 12))) === 'txt_20260923-154012_example.com.txt', buildFilename('www.Example.COM', 'x', new Date(Date.UTC(2026, 8, 23, 15, 40, 12))));
    t('имя файла: пустой хост', buildFilename('', null, new Date(Date.UTC(2026, 0, 1, 0, 0, 0))) === 'txt_20260101-000000_page.txt', buildFilename('', null, new Date(Date.UTC(2026, 0, 1, 0, 0, 0))));
    var st = { chars: 5, words: 2, blockCount: 1, dupes: 0, ms: 7, warnings: [] };
    var pi = { url: 'u', title: 't', host: 'h', dateUtc: 'd', rootDesc: 'article', strategy: 'article-selector', score: 0.9, candidates: [] };
    var txt = buildPageText(pi, [{ kind: 'p', text: 'привет' }], st);
    t('шапка: маркеры', txt.indexOf('=== UACE TXT-EXPORT') === 0 && txt.indexOf('FNV-1a 32') > 0 && txt.indexOf('0 сеть') > 0);
    t('шапка: статистика', txt.indexOf('символов 5') > 0 && txt.indexOf('время 7 мс') > 0);
    var fb = formatBody([{ kind: 'h', text: 'заголовок', level: 1 }, { kind: 'li', text: 'один' }, { kind: 'li', text: 'два' }, { kind: 'p', text: 'абзац' }]);
    t('тело: H1 верхний регистр + буллеты', fb.indexOf('ЗАГОЛОВОК') === 0 && fb.indexOf('\u2022 один') > 0 && fb.indexOf('\u2022 один\n\u2022 два') > 0, fb.slice(0, 40));
    t('пустые блоки → честная пустота', formatBody([]) === '');
    return res;
  }

  var CORE = {
    VER: VER, fnv1a32: fnv1a32, collapseWs: collapseWs, ownText: ownText,
    isNoiseTag: isNoiseTag, isBlockTag: isBlockTag, skipByAria: skipByAria,
    hasBlockChild: hasBlockChild, pickMainRoot: pickMainRoot, makeCtx: makeCtx,
    collectBlocks: collectBlocks, formatBody: formatBody, buildPageText: buildPageText,
    buildFilename: buildFilename, selftest: selftest,
    NOISE_TAGS: NOISE_TAGS, BLOCK_TAGS: BLOCK_TAGS, SKIP_ROLES: SKIP_ROLES
  };

  /* Node: только чистое ядро, страничной части нет */
  if (typeof document === 'undefined') {
    globalThis.__UACE_TXT__ = CORE;
    if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
    return;
  }

  /* ══════════════ L1 RUNTIME — мост страницы: журнал, пилюля, скачивание ══════════════ */

  /* --- журнал [TXT]: кольцо 200, DevTools-зеркало по uaice_txt_debug='1' --- */
  var journalRing = [];
  var debugMode = (function () { try { return localStorage.getItem('uaice_txt_debug') === '1'; } catch (e) { return false; } })();
  function jlog(lvl, scope, msg, data) {
    journalRing.push({ t: new Date().toISOString(), lvl: lvl, scope: scope, msg: String(msg), data: data === undefined ? null : data });
    if (journalRing.length > JOURNAL_CAP) journalRing.shift();
    if (debugMode) {
      var line = '[TXT] ' + lvl + ' ' + scope + ' ' + msg;
      if (lvl === 'error') console.error(line, data || ''); else console.debug(line, data || '');
    }
  }

  /* --- сборка страницы (мост L0 → живой документ) --- */
  function collectPage(doc, opts) {
    var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    var pick = pickMainRoot(doc);
    var ctx = makeCtx(opts);
    collectBlocks(pick.root, ctx, 0, false);
    var ms = Math.max(1, Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0));
    var warnings = [];
    if (ctx.nodesExceeded) warnings.push('обрезка по бюджету (узлов ' + ctx.nodes + ' \u2265 ' + ctx.maxNodes + ' или блоков ' + ctx.blocks.length + ' \u2265 ' + ctx.maxBlocks + ') — файл честно помечен');
    if (ctx.timeExceeded) warnings.push('обрезка по бюджету времени (' + ctx.budgetMs + ' мс) — продолжение в следующем релизе полигон-линии');
    if (ctx.errors) warnings.push('ошибок обхода: ' + ctx.errors + ' (учтены честно)');
    if (!ctx.blocks.length) warnings.push('текстовых блоков не найдено — страница пустая/канвас-приложение; файл содержит только шапку');
    var body = formatBody(ctx.blocks);
    var stats = {
      chars: body.length,
      words: (body.match(/\S+/g) || []).length,
      blockCount: ctx.blocks.length,
      dupes: ctx.dupes,
      ms: ms,
      warnings: warnings
    };
    var pi = {
      url: '', title: doc.title || '', host: '',
      dateUtc: new Date().toISOString(),
      rootDesc: pick.desc, strategy: pick.strategy, score: pick.score,
      candidates: pick.candidates, note: pick.note
    };
    try { pi.url = String(doc.defaultView && doc.defaultView.location ? doc.defaultView.location.href : doc.URL || ''); } catch (e) { pi.url = ''; }
    try { pi.host = pi.url ? (new URL(pi.url).host || 'file') : 'file'; } catch (e) { pi.host = 'file'; }
    var text = buildPageText(pi, ctx.blocks, stats);
    var fname = buildFilename(pi.host, pi.title, new Date());
    jlog('info', 'capture', 'снято блоков ' + stats.blockCount + ', ' + stats.chars + ' симв., ' + ms + ' мс, стратегия ' + pick.strategy);
    for (var wi = 0; wi < warnings.length; wi++) jlog('warn', 'capture', warnings[wi]);
    return { text: text, filename: fname, stats: stats, pick: { strategy: pick.strategy, score: pick.score, desc: pick.desc }, blocks: ctx.blocks };
  }

  /* --- скачивание: РЕАЛЬНЫЙ Blob + a[download] (никаких симуляций) --- */
  function downloadText(text, filename) {
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    a.style.display = 'none';
    (document.body || document.documentElement).appendChild(a);
    a.click();
    setTimeout(function () {
      try { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); } catch (e) { /* честно */ }
    }, 1200);
  }

  /* --- ЕДИНАЯ ТОЧКА ФУНКЦИИ: экспорт текущей страницы в .txt --- */
  var lastResult = null;
  var busy = false;
  function exportCurrentPage(source) {
    if (busy) { jlog('warn', 'export', 'захват уже идёт — повторный вызов отклонён (' + source + ')'); return null; }
    busy = true;
    try {
      var res = collectPage(document, {});
      downloadText(res.text, res.filename);
      lastResult = { at: new Date().toISOString(), source: source, filename: res.filename, stats: res.stats, strategy: res.pick.strategy };
      jlog('info', 'export', 'файл сохранён: ' + res.filename + ' (' + source + ')', res.stats);
      return lastResult;
    } catch (err) {
      jlog('error', 'export', 'сбой захвата: ' + (err && err.message || String(err)));
      try { console.error('[TXT] export-fail', err); } catch (e2) { /* honest */ }
      return null;
    } finally {
      busy = false;
    }
  }

  /* --- хоткей канона: Alt+T (e.code, раскладко-независимо; поля ввода не трогаем) --- */
  window.addEventListener('keydown', function (e) {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.code !== 'KeyT') return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
    e.stopPropagation();
    exportCurrentPage('hotkey:Alt+T');
  }, true);

  /* --- пилюля «TXT» в Shadow DOM: чёрный фон + золото (канон владельца) --- */
  function mountPill() {
    try {
      var host = document.createElement('div');
      host.id = 'uace-txt-host';
      host.style.cssText = 'all:initial; position:fixed; right:14px; bottom:14px; z-index:2147483647;';
      var sh = host.attachShadow({ mode: 'closed' });
      var st = document.createElement('style');
      st.textContent =
        '.pill{all:initial;display:inline-block;padding:8px 14px;border-radius:999px;' +
        'background:#000000;color:#f2d766;border:1px solid #f2d766;' +
        'font:600 12px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;' +
        'letter-spacing:.08em;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.35);user-select:none}' +
        '.pill:hover{background:#111114}' +
        '.pill:active{transform:translateY(1px)}';
      var b = document.createElement('button');
      b.className = 'pill';
      b.type = 'button';
      b.textContent = 'TXT';
      b.title = 'UACE TXT-EXPORT: экспорт страницы в текст (Alt+T)';
      b.setAttribute('aria-label', 'Экспорт страницы в текст');
      b.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); exportCurrentPage('pill'); }, true);
      sh.appendChild(st);
      sh.appendChild(b);
      (document.body || document.documentElement).appendChild(host);
      jlog('info', 'boot', 'пилюля TXT смонтирована (Shadow DOM, чёрный + золото)');
    } catch (err) {
      jlog('warn', 'boot', 'пилюля не смонтировалась (CSP/окружение): ' + (err && err.message || err));
    }
  }

  /* --- BOOT --- */
  function boot() {
    jlog('info', 'boot', 'UACE TXT-EXPORT v' + VER + ' на странице: ' + location.host);
    var st = selftest();
    var bad = st.filter(function (r) { return !r.ok; });
    jlog(bad.length ? 'error' : 'info', 'selftest', bad.length ? ('ПРОВАЛ ' + bad.length + '/' + st.length) : ('selftest ' + st.length + '/' + st.length + ' OK'));
    mountPill();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  /* --- мост window.__UACE_TXT__ (канон связи модулей) --- */
  window.__UACE_TXT__ = {
    version: VER,
    capture: exportCurrentPage,
    collect: function () { return collectPage(document, {}); },
    selftest: selftest,
    journal: function () { return journalRing.slice(); },
    last: function () { return lastResult; },
    CORE: CORE
  };
})();
