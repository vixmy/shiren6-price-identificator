// シレン6 値段識別ツール — 入力処理・描画
(function () {
  'use strict';

  // アプリのバージョン（画面下部に小さく表示する）
  var APP_VERSION = '1.5.0';

  var MAX_DIGITS = 6;

  // カテゴリの表示順と表示名（docs/SPEC.md §5, §8）
  var CATEGORIES = ['grass', 'scroll', 'staff', 'bracelet', 'pot', 'weapon_shield'];
  var CATEGORY_LABELS = {
    grass: '草',
    scroll: '巻物',
    staff: '杖',
    bracelet: '腕輪',
    pot: '壺',
    weapon_shield: '武器・盾'
  };
  var STATES = ['normal', 'blessed', 'cursed'];
  var STATE_LABELS = { normal: '通常', blessed: '祝福', cursed: '呪い' };

  // 出所（data/appearance.js のキー。並びはボタンの並びと同じ）
  var SOURCES = ['shop', 'buried_shop', 'floor', 'buried', 'island', 'behemoth', 'transform', 'todo', 'steal'];

  var priceInput = document.getElementById('price-input');
  var keypad = document.getElementById('keypad');
  var keypadToggle = document.getElementById('keypad-toggle');
  var filters = document.querySelector('.filters');
  var dungeonSelect = document.getElementById('dungeon-select');
  var sourcesBar = document.getElementById('sources-bar');
  var sourceFilters = document.getElementById('sources');
  var resultsCount = document.getElementById('results-count');
  var resultsMessage = document.getElementById('results-message');
  var resultList = document.getElementById('result-list');

  // 現在の入力値（正規化済みの数字文字列。空文字は未入力）
  var value = '';

  // テンキーを出し直したときの「全選択」状態。テキストバーにフォーカスを移さずに
  // （ソフトキーボードを出さずに）、次の入力で置き換え・⌫ で全消去にする
  var replacePending = false;

  // 選択中のカテゴリ。何も選んでいないときは「すべて」扱い（永続化しない）
  var selectedCategories = {};

  // 選択中のダンジョン（normal / shinzui / choshinzui。初期値は通常、永続化しない）
  var dungeon = 'normal';
  // 選択中の出所。何も選んでいないときは「出所すべて」扱い（永続化しない）
  var selectedSources = {};

  // ダンジョン → 出所 → { アイテム名: true }（起動時に1回だけ作る）
  var appearance = buildAppearance(window.SHIREN6_APPEARANCE ? window.SHIREN6_APPEARANCE.dungeons : {});

  // 全アイテムを「アイテム × 回数/修正値」単位にまとめ、表示順に並べた一覧（起動時に1回だけ作る）
  var allUnits = buildUnitList(window.SHIREN6_ITEMS ? window.SHIREN6_ITEMS.items : []);

  // --- データ準備 ---
  // 1ユニット = 1アイテムの1つの回数/修正値。状態ごとの買値・売値を持つ
  function buildUnitList(items) {
    var list = [];
    items.forEach(function (item, itemIndex) {
      var byModifier = {};
      item.variants.forEach(function (v) {
        var modifier = typeof v.count === 'number' ? v.count : (typeof v.plus === 'number' ? v.plus : null);
        var key = String(modifier);
        if (!byModifier[key]) {
          byModifier[key] = { item: item, itemIndex: itemIndex, modifier: modifier, prices: {} };
          list.push(byModifier[key]);
        }
        byModifier[key].prices[v.state] = { buy: v.buy, sell: v.sell };
      });
    });
    // カテゴリ順 → データ定義順 → 回数/修正値の昇順
    list.sort(function (a, b) {
      return (CATEGORIES.indexOf(a.item.category) - CATEGORIES.indexOf(b.item.category)) ||
        (a.itemIndex - b.itemIndex) ||
        ((a.modifier || 0) - (b.modifier || 0));
    });
    return list;
  }

  function buildAppearance(dungeons) {
    var result = {};
    Object.keys(dungeons).forEach(function (d) {
      result[d] = {};
      SOURCES.forEach(function (src) {
        var names = {};
        (dungeons[d].sources[src] || []).forEach(function (name) { names[name] = true; });
        result[d][src] = names;
      });
    });
    return result;
  }

  // --- 検索 ---
  function isCategoryShown(category) {
    var anySelected = CATEGORIES.some(function (c) { return selectedCategories[c]; });
    return !anySelected || selectedCategories[category];
  }

  // 通常ダンジョンでは全アイテム。神髄・超・神髄では、選択中の出所（未選択なら全出所）の
  // どれかで出現するアイテムだけ
  function isAvailable(item) {
    if (dungeon === 'normal') return true;
    var bySource = appearance[dungeon];
    if (!bySource) return true;
    var anySelected = SOURCES.some(function (src) { return selectedSources[src]; });
    return SOURCES.some(function (src) {
      return (!anySelected || selectedSources[src]) && bySource[src][item.name];
    });
  }

  // どれかの状態の買値・売値が完全一致するユニットを返す。
  // price が null（値段未入力）のときは条件に合うアイテムの一覧用に、杖・壺は回数0、
  // 武器・盾は修正値+0 のユニットだけを返す
  function search(price) {
    return allUnits.filter(function (unit) {
      if (!isCategoryShown(unit.item.category)) return false;
      if (!isAvailable(unit.item)) return false;
      if (price === null) return unit.modifier === null || unit.modifier === 0;
      return STATES.some(function (s) {
        var p = unit.prices[s];
        return p && (p.buy === price || p.sell === price);
      });
    });
  }

  // カテゴリごとに、価格表と回数/修正値が完全に同じユニットをまとめる
  // （回数・修正値が違えば価格が同じでも別グループにする）
  // 戻り値: [{ category, groups: [{ prices, units: [...] }] }]
  function groupResults(units) {
    var sections = [];
    var sectionByCategory = {};
    units.forEach(function (unit) {
      var category = unit.item.category;
      var section = sectionByCategory[category];
      if (!section) {
        section = sectionByCategory[category] = { category: category, groups: [], groupByKey: {} };
        sections.push(section);
      }
      var key = unit.modifier + '|' + priceKey(unit.prices);
      if (!section.groupByKey[key]) {
        section.groupByKey[key] = { prices: unit.prices, units: [] };
        section.groups.push(section.groupByKey[key]);
      }
      section.groupByKey[key].units.push(unit);
    });
    return sections;
  }

  function priceKey(prices) {
    return STATES.map(function (s) {
      var p = prices[s];
      return p ? p.buy + '/' + p.sell : '-';
    }).join(',');
  }

  // 数字以外を除去し、先頭ゼロを除去（"0" 単独は可）、最大桁数で切り詰める
  function normalize(str) {
    var digits = String(str).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    return digits.slice(0, MAX_DIGITS);
  }

  function setReplacePending(on) {
    replacePending = on;
    priceInput.classList.toggle('is-selected', on);
  }

  function setValue(next) {
    setReplacePending(false);
    next = normalize(next);
    if (priceInput.value !== next) {
      priceInput.value = next;
    }
    if (next === value) return;
    value = next;
    render();
  }

  // テキストバーの数字が全選択されているか（タップ直後など）
  function isAllSelected() {
    if (replacePending) return true;
    return document.activeElement === priceInput && value !== '' &&
      priceInput.selectionStart === 0 && priceInput.selectionEnd === priceInput.value.length;
  }

  // 全選択中はテンキーの入力で置き換える（通常のテキスト入力と同じ動き）
  function appendDigit(d) {
    setValue(isAllSelected() ? d : value + d);
  }

  function backspace() {
    setValue(isAllSelected() ? '' : value.slice(0, -1));
  }

  function clearAll() {
    setValue('');
  }

  // --- 描画 ---
  function render() {
    resultList.textContent = '';

    // 値段が空のときは、条件（ダンジョン・出所・カテゴリ）に合うアイテムの価格一覧を出す
    var price = value === '' ? null : Number(value);
    var units = search(price);
    resultsCount.textContent = units.length + '件' + (price === null ? '（値段を入力すると絞り込みます）' : '');
    resultsCount.hidden = false;

    if (units.length === 0) {
      resultsMessage.textContent = '該当なし';
      resultsMessage.hidden = false;
      return;
    }
    resultsMessage.hidden = true;

    var fragment = document.createDocumentFragment();
    groupResults(units).forEach(function (section) {
      fragment.appendChild(createSection(section, price));
    });
    resultList.appendChild(fragment);
  }

  // [草] などのカテゴリ見出し + 価格グループの並び
  function createSection(section, price) {
    var el = document.createElement('section');
    el.className = 'result-section';
    el.appendChild(createElement('h2', 'section-heading cat-' + section.category, CATEGORY_LABELS[section.category]));
    section.groups.forEach(function (group) {
      el.appendChild(createGroup(group, price));
    });
    return el;
  }

  // 価格表が同じアイテム名の列 + 価格表（一致した値段をハイライト）
  // price が null のときは一覧表示: 杖・壺・武器・盾は回数0・+0 の値段と、増え方の注記を出す
  function createGroup(group, price) {
    var el = document.createElement('div');
    el.className = 'price-group';
    var listing = price === null;
    var first = group.units[0];
    var baseLabel = '';
    if (listing && first.modifier !== null) {
      baseLabel = first.item.category === 'weapon_shield' ? '（+0）' : '（回数0）';
    }

    var names = document.createElement('div');
    names.className = 'group-names';
    group.units.forEach(function (unit) {
      names.appendChild(createElement('div', 'unit-name', listing ? unit.item.name : unitName(unit)));
    });
    el.appendChild(names);

    // 2列のセル: 上段 買値・売値、下段 祝福（買/売）・呪い（買/売）
    var grid = document.createElement('div');
    grid.className = 'price-grid';
    var normal = group.prices.normal;
    if (normal) {
      grid.appendChild(createCell('cell-normal', '買値' + baseLabel, [normal.buy], price));
      grid.appendChild(createCell('cell-normal', '売値' + baseLabel, [normal.sell], price));
    }
    // 祝福・呪いはデータにある状態だけ表示（腕輪・杖・壺・武器・盾には祝福データを持たせない）
    ['blessed', 'cursed'].forEach(function (s) {
      var p = group.prices[s];
      if (!p) return;
      grid.appendChild(createCell('cell-' + s, STATE_LABELS[s] + '（買/売）', [p.buy, p.sell], price));
    });
    el.appendChild(grid);

    if (baseLabel) {
      el.appendChild(createElement('p', 'price-note', first.item.category === 'weapon_shield'
        ? '※修正値±1ごとに 買±100・売±40'
        : '※回数+1ごとに 買+100・売+40'));
    }

    return el;
  }

  // 小さな見出し + 値段（複数なら「1000/870」）のセル。一致した値段をハイライト
  function createCell(className, label, amounts, price) {
    var cell = document.createElement('div');
    cell.className = 'price-cell ' + className;
    cell.appendChild(createElement('div', 'cell-label', label));
    var valueEl = document.createElement('div');
    valueEl.className = 'cell-value';
    amounts.forEach(function (amount, i) {
      if (i > 0) valueEl.appendChild(createElement('span', 'price-sep', '/'));
      valueEl.appendChild(createElement('span', 'price' + (amount === price ? ' is-hit' : ''), String(amount)));
    });
    cell.appendChild(valueEl);
    return cell;
  }

  // 杖・壺は「杖A[5]」、武器・盾は「剣A+1」「剣A-2」
  function unitName(unit) {
    if (unit.modifier === null) return unit.item.name;
    if (unit.item.category === 'weapon_shield') {
      return unit.item.name + (unit.modifier < 0 ? '' : '+') + unit.modifier;
    }
    return unit.item.name + '[' + unit.modifier + ']';
  }

  function createElement(tag, className, text) {
    var el = document.createElement(tag);
    el.className = className;
    el.textContent = text;
    return el;
  }

  // --- カテゴリフィルタ ---
  // 「すべて」状態からカテゴリを押すとそのカテゴリだけ表示。以降押したものを追加/解除。
  // 全部解除したら「すべて」に戻る。
  // ボタンの data 属性の値 → 選択状態。「all」ボタンは何も選んでいないときにアクティブ
  function updateToggleButtons(container, attr, keys, selected) {
    var anySelected = keys.some(function (k) { return selected[k]; });
    Array.prototype.forEach.call(container.querySelectorAll('[' + attr + ']'), function (btn) {
      var key = btn.getAttribute(attr);
      var active = key === 'all' ? !anySelected : !!selected[key];
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function updateFilterButtons() {
    updateToggleButtons(filters, 'data-filter', CATEGORIES, selectedCategories);
    updateToggleButtons(sourceFilters, 'data-source', SOURCES, selectedSources);
  }

  filters.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-filter]');
    if (!btn) return;
    var f = btn.getAttribute('data-filter');
    // 排他選択: 押したカテゴリだけを表示。選択中のカテゴリをもう一度押すか「すべて」で全カテゴリに戻る
    var wasSelected = !!selectedCategories[f];
    selectedCategories = {};
    if (f !== 'all' && !wasSelected) {
      selectedCategories[f] = true;
    }
    updateFilterButtons();
    render();
  });

  // --- 出所フィルタ（カテゴリフィルタと同じく排他選択） ---
  sourceFilters.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-source]');
    if (!btn) return;
    var src = btn.getAttribute('data-source');
    var wasSelected = !!selectedSources[src];
    selectedSources = {};
    if (src !== 'all' && !wasSelected) {
      selectedSources[src] = true;
    }
    updateFilterButtons();
    render();
  });

  // PC のマウスホイール（縦回転）でも出所フィルタを横スクロールできるようにする。
  // 端まで来たら既定の動作に任せる
  sourceFilters.addEventListener('wheel', function (e) {
    if (e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    var delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;  // 行単位（Firefox）→ px
    var max = sourceFilters.scrollWidth - sourceFilters.clientWidth;
    if ((delta < 0 && sourceFilters.scrollLeft <= 0) || (delta > 0 && sourceFilters.scrollLeft >= max)) return;
    e.preventDefault();
    sourceFilters.scrollLeft += delta;
  }, { passive: false });

  // 横スクロールの続きがある側の端を薄くする（折り返し表示のときはスクロールしないので何も付かない）
  function updateSourceFade() {
    var max = sourceFilters.scrollWidth - sourceFilters.clientWidth;
    sourceFilters.classList.toggle('fade-left', max > 1 && sourceFilters.scrollLeft > 1);
    sourceFilters.classList.toggle('fade-right', max > 1 && sourceFilters.scrollLeft < max - 1);
  }
  sourceFilters.addEventListener('scroll', updateSourceFade, { passive: true });
  window.addEventListener('resize', updateSourceFade);

  // --- ダンジョン選択 ---
  // 神髄・超・神髄のときだけ出所フィルタを出す。ダンジョンを変えたら出所の選択は戻す
  dungeonSelect.addEventListener('change', function () {
    dungeon = dungeonSelect.value;
    selectedSources = {};
    sourcesBar.hidden = dungeon === 'normal';
    updateSourceFade();
    updateFilterButtons();
    render();
  });

  // --- 画面上のテンキー ---
  // pointerdown の既定動作を止めてフォーカス移動を防ぐ（ソフトキーボードを出さない）
  keypad.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.key')) e.preventDefault();
  });
  keypad.addEventListener('mousedown', function (e) {
    if (e.target.closest('.key')) e.preventDefault();
  });
  keypad.addEventListener('click', function (e) {
    var btn = e.target.closest('.key');
    if (!btn) return;
    var key = btn.getAttribute('data-key');
    if (key === 'clear') {
      clearAll();
    } else if (key === 'backspace') {
      backspace();
    } else {
      appendDigit(key);
    }
  });

  // --- テンキーの出し入れ（∨ で隠す / ∧ で出す。永続化しない） ---
  keypadToggle.addEventListener('pointerdown', function (e) { e.preventDefault(); });
  keypadToggle.addEventListener('mousedown', function (e) { e.preventDefault(); });
  keypadToggle.addEventListener('click', function () {
    var show = keypad.hidden;
    keypad.hidden = !show;
    keypadToggle.textContent = show ? '∨' : '∧';
    keypadToggle.setAttribute('aria-expanded', show ? 'true' : 'false');
    keypadToggle.setAttribute('aria-label', show ? 'テンキーを隠す' : 'テンキーを出す');
    // 出し直したら入力済みの値段を全選択扱いにする（そのまま次の値段を打てば置き換わる）
    setReplacePending(show && value !== '');
  });

  // --- テキストバー直接入力 ---
  priceInput.addEventListener('input', function () {
    setValue(priceInput.value);
  });

  // クリック・タップしたら入力済みの数字を全選択する（そのまま打てば置き換わる）
  function selectAllPrice() {
    priceInput.setSelectionRange(0, priceInput.value.length);
  }
  priceInput.addEventListener('focus', function () {
    setReplacePending(false);  // フォーカス後はブラウザ本来の全選択に任せる
    // フォーカス直後はブラウザがカーソル位置を決めるので、その後で選択する
    setTimeout(selectAllPrice, 0);
  });
  priceInput.addEventListener('click', selectAllPrice);

  // --- 物理キーボード（ページ上どこでも） ---
  function digitFromEvent(e) {
    if (/^[0-9]$/.test(e.key)) return e.key;
    // NumLock オフのテンキーも数字として扱う
    var m = /^Numpad([0-9])$/.exec(e.code || '');
    return m ? m[1] : null;
  }

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    // 武器・盾の値段画面を開いている間は値段入力を受け付けない（js/weapon.js が扱う）
    if (document.body.classList.contains('is-weapon-open')) return;

    // テキストバーにフォーカスがあるときは、ブラウザ標準の編集 + input イベントに任せる
    // （ここで処理すると二重入力になる）。全消去キーだけは扱う。
    if (e.target === priceInput) {
      if (e.key === 'Escape') {
        e.preventDefault();
        clearAll();
      }
      return;
    }

    var digit = digitFromEvent(e);
    if (digit !== null) {
      e.preventDefault();
      appendDigit(digit);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      backspace();
    } else if (e.key === 'Escape' || e.key === 'Delete') {
      e.preventDefault();
      clearAll();
    }
  });

  // --- Service Worker（オフライン対応）---
  // file:// で開いたときは登録できないので http(s) のときだけ登録する
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.warn('Service Worker の登録に失敗しました', err);
      });
    });
  }

  document.getElementById('app-version').textContent = 'v' + APP_VERSION;
  // リロード時にブラウザが前回の選択を復元することがあるので、初期値（通常）に戻す
  dungeonSelect.value = 'normal';
  updateFilterButtons();
  render();
})();
