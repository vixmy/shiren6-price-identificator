// シレン6 値段識別ツール — 武器・盾の値段計算画面（docs/SPEC.md §12）
(function () {
  'use strict';

  var DATA = window.SHIREN6_WEAPONS || {};

  // 一覧に出す修正値
  var PLUS_VALUES = [-1, 0, 1, 2, 3];
  var MAX_DIGIT_SEALS = 9;
  var KIND_LABELS = { weapon: '武器', shield: '盾' };

  var appEl = document.querySelector('.app');
  var view = document.getElementById('weapon-view');
  var openBtn = document.getElementById('weapon-open');
  var backBtn = document.getElementById('weapon-back');
  var resetBtn = document.getElementById('ws-reset');
  var nameEl = document.getElementById('ws-name');
  var jingiBtn = document.getElementById('ws-jingi');
  var chipsEl = document.getElementById('ws-chips');
  var tableWrap = document.getElementById('ws-table-wrap');
  var rowsEl = document.getElementById('ws-rows');
  var tabsEl = document.getElementById('ws-tabs');
  var picker = document.getElementById('ws-picker');

  // 選択状態（永続化しない）
  var tab = 'weapon';      // weapon | shield | seal
  var kind = null;         // 選んだアイテムの種類（weapon | shield）。未選択は null
  var itemIndex = -1;      // DATA[kind].items の添字
  var jingi = false;
  var seals = [];          // 選んだ印の label（選んだ順）
  var digitCount = 0;      // 数字の印の個数

  // --- 計算（[D] note の計算式。tools/build_weapons.py の冒頭も参照） ---
  // 買値 = (元の買値 × 神器補正 + 修正値 × 100 + 印の買値) × 呪い補正
  // 売値 = (元の買値 × 神器補正 × 0.4 + 修正値 × 40 + 印の売値) × 呪い補正
  // 武器・盾の値段は50の倍数なので × 0.4 で端数は出ない。呪いは最後に 0.87 倍して切り捨て
  function sealTotal() {
    var d = DATA[kind];
    var total = { buy: d.digit.buy * digitCount, sell: d.digit.sell * digitCount };
    d.seals.forEach(function (s) {
      if (seals.indexOf(s.label) < 0) return;
      total.buy += s.buy;
      total.sell += s.sell;
    });
    return total;
  }

  function calcPrices(plus) {
    var base = DATA[kind].items[itemIndex].buy * (jingi ? 2 : 1);
    var seal = sealTotal();
    var buy = base + plus * 100 + seal.buy;
    var sell = base * 2 / 5 + plus * 40 + seal.sell;
    return {
      buy: buy,
      sell: sell,
      cursedBuy: Math.floor(buy * 87 / 100),
      cursedSell: Math.floor(sell * 87 / 100)
    };
  }

  // --- 描画 ---
  function render() {
    renderSummary();
    renderTabs();
    renderPicker();
  }

  function renderSummary() {
    var selected = kind !== null;
    nameEl.textContent = selected ? DATA[kind].items[itemIndex].name : '武器か盾を選んでください';
    nameEl.classList.toggle('is-empty', !selected);
    jingiBtn.classList.toggle('is-active', jingi);
    jingiBtn.setAttribute('aria-pressed', jingi ? 'true' : 'false');

    // 選んだ印（タップで外す）
    chipsEl.textContent = '';
    seals.forEach(function (label) {
      chipsEl.appendChild(createChip(label, 'seal', label));
    });
    if (digitCount > 0) {
      chipsEl.appendChild(createChip('数字×' + digitCount, 'digit', ''));
    }
    chipsEl.hidden = seals.length === 0 && digitCount === 0;

    tableWrap.hidden = !selected;
    rowsEl.textContent = '';
    if (!selected) return;
    PLUS_VALUES.forEach(function (plus) {
      var p = calcPrices(plus);
      var tr = document.createElement('tr');
      if (plus === 0) tr.className = 'is-zero';
      tr.appendChild(createElement('th', 'col-plus', (plus < 0 ? '' : '+') + plus));
      tr.appendChild(createElement('td', 'col-normal', String(p.buy)));
      tr.appendChild(createElement('td', 'col-normal', String(p.sell)));
      tr.appendChild(createElement('td', 'col-cursed', String(p.cursedBuy)));
      tr.appendChild(createElement('td', 'col-cursed', String(p.cursedSell)));
      rowsEl.appendChild(tr);
    });
  }

  function createChip(text, type, label) {
    var chip = createElement('button', 'ws-chip', text);
    chip.type = 'button';
    chip.setAttribute('data-chip', type);
    chip.setAttribute('data-label', label);
    chip.setAttribute('aria-label', text + 'を外す');
    return chip;
  }

  function renderTabs() {
    Array.prototype.forEach.call(tabsEl.querySelectorAll('[data-tab]'), function (btn) {
      var active = btn.getAttribute('data-tab') === tab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    // 印タブには選んだアイテムの種類を添える（武器印 / 盾印）
    tabsEl.querySelector('[data-tab="seal"]').textContent = kind ? KIND_LABELS[kind] + 'の印' : '印';
  }

  function renderPicker() {
    picker.textContent = '';
    if (tab === 'seal') {
      renderSealPicker();
    } else {
      renderItemPicker(tab);
    }
    picker.appendChild(createCredits());
  }

  // 出典表記（選択肢の一番下に小さく）
  function createCredits() {
    var p = createElement('p', 'credits', '出典: ');
    p.appendChild(createLink('https://shiren6.game-info.wiki/', '風来のシレン6 とぐろ島探検録 Wiki'));
    p.appendChild(document.createTextNode(' / '));
    p.appendChild(createLink('https://note.com/shiny_llama970/n/n8469520feb5f', '武器・盾の値段の計算式（note）'));
    return p;
  }

  function createLink(href, text) {
    var a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = text;
    return a;
  }

  function renderItemPicker(k) {
    var grid = createElement('div', 'ws-grid ws-grid-items', '');
    DATA[k].items.forEach(function (item, i) {
      var btn = createElement('button', 'ws-option' + (k === kind && i === itemIndex ? ' is-active' : ''), item.name);
      btn.type = 'button';
      btn.setAttribute('data-kind', k);
      btn.setAttribute('data-index', String(i));
      grid.appendChild(btn);
    });
    picker.appendChild(grid);
  }

  function renderSealPicker() {
    if (kind === null) {
      picker.appendChild(createElement('p', 'ws-message', '先に武器か盾を選んでください'));
      return;
    }
    var d = DATA[kind];
    picker.appendChild(createElement('p', 'ws-hint', '最初から付いている印は選ばない（元の値段に含まれる）'));

    var grid = createElement('div', 'ws-grid ws-grid-seals', '');
    d.seals.forEach(function (s) {
      var btn = createElement('button', 'ws-option ws-seal' + (seals.indexOf(s.label) >= 0 ? ' is-active' : ''), '');
      btn.type = 'button';
      btn.setAttribute('data-seal', s.label);
      btn.setAttribute('aria-pressed', seals.indexOf(s.label) >= 0 ? 'true' : 'false');
      btn.appendChild(createElement('span', 'ws-seal-label', s.label));
      btn.appendChild(createElement('span', 'ws-seal-price', String(s.buy)));
      grid.appendChild(btn);
    });

    // 数字の印（0〜9 は同じ値段なので1つにまとめ、個数で指定する）
    var digit = createElement('div', 'ws-digit' + (digitCount > 0 ? ' is-active' : ''), '');
    var label = createElement('span', 'ws-digit-label', '');
    label.appendChild(createElement('span', 'ws-seal-label', '数字'));
    label.appendChild(createElement('span', 'ws-seal-price', d.digit.buy + '/個'));
    digit.appendChild(label);
    digit.appendChild(createStepButton('−', -1, '数字の印を減らす', digitCount === 0));
    digit.appendChild(createElement('span', 'ws-digit-count', String(digitCount)));
    digit.appendChild(createStepButton('＋', 1, '数字の印を増やす', digitCount >= MAX_DIGIT_SEALS));
    grid.appendChild(digit);

    picker.appendChild(grid);
  }

  function createStepButton(text, step, ariaLabel, disabled) {
    var btn = createElement('button', 'ws-step', text);
    btn.type = 'button';
    btn.setAttribute('data-step', String(step));
    btn.setAttribute('aria-label', ariaLabel);
    btn.disabled = disabled;
    return btn;
  }

  function createElement(tag, className, text) {
    var el = document.createElement(tag);
    el.className = className;
    el.textContent = text;
    return el;
  }

  // --- 操作 ---
  function setTab(next) {
    if (tab === next) return;
    tab = next;
    render();
    picker.scrollTop = 0;
  }

  // アイテムを選んだら印の選択は外し、そのまま印タブへ進む
  function selectItem(k, i) {
    if (k !== kind || i !== itemIndex) {
      kind = k;
      itemIndex = i;
      seals = [];
      digitCount = 0;
    }
    tab = 'seal';
    render();
    picker.scrollTop = 0;
  }

  function toggleSeal(label) {
    var i = seals.indexOf(label);
    if (i >= 0) {
      seals.splice(i, 1);
    } else {
      seals.push(label);
    }
    render();
  }

  function setDigitCount(n) {
    digitCount = Math.max(0, Math.min(MAX_DIGIT_SEALS, n));
    render();
  }

  function reset() {
    kind = null;
    itemIndex = -1;
    jingi = false;
    seals = [];
    digitCount = 0;
    tab = 'weapon';
    render();
    picker.scrollTop = 0;
  }

  tabsEl.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-tab]');
    if (btn) setTab(btn.getAttribute('data-tab'));
  });

  picker.addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    if (btn.hasAttribute('data-kind')) {
      selectItem(btn.getAttribute('data-kind'), Number(btn.getAttribute('data-index')));
    } else if (btn.hasAttribute('data-seal')) {
      toggleSeal(btn.getAttribute('data-seal'));
    } else if (btn.hasAttribute('data-step')) {
      setDigitCount(digitCount + Number(btn.getAttribute('data-step')));
    }
  });

  chipsEl.addEventListener('click', function (e) {
    var chip = e.target.closest('[data-chip]');
    if (!chip) return;
    if (chip.getAttribute('data-chip') === 'digit') {
      setDigitCount(0);
    } else {
      toggleSeal(chip.getAttribute('data-label'));
    }
  });

  jingiBtn.addEventListener('click', function () {
    jingi = !jingi;
    render();
  });

  resetBtn.addEventListener('click', reset);

  // --- 画面の出し入れ ---
  // URL の #weapon を目印にして履歴に積む。ブラウザの戻る（スワイプ含む）でも閉じられる
  var HASH = '#weapon';
  // この画面を開いたときに履歴を1つ積んだか（積んでいれば閉じるときは history.back() で戻す）
  var pushed = false;

  function showView(show) {
    document.body.classList.toggle('is-weapon-open', show);
    view.setAttribute('aria-hidden', show ? 'false' : 'true');
    if (show) {
      view.removeAttribute('inert');
      appEl.setAttribute('inert', '');
    } else {
      view.setAttribute('inert', '');
      appEl.removeAttribute('inert');
    }
  }

  function syncWithHash() {
    var open = location.hash === HASH;
    if (!open) pushed = false;
    showView(open);
  }

  openBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); });
  openBtn.addEventListener('click', function () {
    if (location.hash === HASH) {
      showView(true);  // replaceState できずに #weapon が残っている場合
      return;
    }
    pushed = true;
    location.hash = HASH;  // hashchange で表示する
  });

  function close() {
    if (pushed) {
      history.back();  // hashchange で閉じる
      return;
    }
    // #weapon 付きの URL で直接開いたときは、履歴を増やさずに URL から外す
    try {
      history.replaceState(null, '', location.href.split('#')[0]);
    } catch (err) {
      // file:// などで replaceState できない場合は URL はそのまま
    }
    showView(false);
  }

  backBtn.addEventListener('click', close);
  window.addEventListener('hashchange', syncWithHash);

  document.addEventListener('keydown', function (e) {
    if (!document.body.classList.contains('is-weapon-open')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });

  render();
  syncWithHash();
})();
