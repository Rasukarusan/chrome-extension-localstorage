'use strict';

const $ = (sel, el = document) => el.querySelector(sel);

const NEW_KEY = '__new__';

const state = {
  tabId: null,
  host: '',
  items: [],
  filter: '',
  openKey: null,
};

let toastTimer;
function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

/* ---------- page access ---------- */

async function execInPage(func, args = []) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: state.tabId },
    func,
    args,
  });
  return result?.result;
}

const pageGetAll = () => {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    out.push({ key, value: localStorage.getItem(key) });
  }
  return out;
};

const pageSet = (key, value) => { localStorage.setItem(key, value); };
const pageRemove = (key) => { localStorage.removeItem(key); };
const pageClear = () => {
  const n = localStorage.length;
  localStorage.clear();
  return n;
};
const pageImport = (entries) => {
  let ok = 0;
  for (const [key, value] of entries) {
    try {
      localStorage.setItem(key, value);
      ok++;
    } catch { /* continue */ }
  }
  return ok;
};

/* ---------- data ---------- */

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https?:/i.test(tab.url)) {
    $('#host').textContent = 'このページでは使用できません';
    renderEmpty('http / https のページで開いてください');
    $('#count').textContent = '';
    return;
  }
  state.tabId = tab.id;
  state.host = new URL(tab.url).hostname;
  $('#host').textContent = state.host;
  await reload();
}

async function reload() {
  if (state.tabId == null) return;
  try {
    const items = (await execInPage(pageGetAll)) ?? [];
    items.sort((a, b) => a.key.localeCompare(b.key));
    state.items = items;
    render();
  } catch (e) {
    renderEmpty('localStorageを読み取れません');
    toast(`読み取りエラー: ${e.message}`, true);
  }
}

/* ---------- render ---------- */

function renderEmpty(msg) {
  const list = $('#list');
  list.textContent = '';
  const div = document.createElement('div');
  div.className = 'empty';
  const icon = document.createElement('span');
  icon.className = 'empty-icon';
  icon.textContent = '🗄️';
  const text = document.createElement('p');
  text.textContent = msg;
  div.append(icon, text);
  list.append(div);
}

function render() {
  const list = $('#list');
  list.textContent = '';

  if (state.openKey === NEW_KEY) {
    list.append(buildItem({ key: '', value: '' }, true));
  }

  const q = state.filter.toLowerCase();
  const visible = state.items.filter(
    (it) => !q || it.key.toLowerCase().includes(q) || it.value.toLowerCase().includes(q)
  );

  for (const it of visible) list.append(buildItem(it, false));

  if (!visible.length && state.openKey !== NEW_KEY) {
    renderEmpty(state.items.length ? '一致するアイテムがありません' : 'このサイトのlocalStorageは空です');
  }

  $('#count').textContent = `${state.items.length} 件のアイテム${q ? `（${visible.length} 件表示）` : ''}`;
}

function buildItem(item, isNew) {
  const key = isNew ? NEW_KEY : item.key;
  const node = $('#tpl-item').content.firstElementChild.cloneNode(true);

  $('.item-name', node).textContent = isNew ? '新しいアイテム' : (item.key || '(キーなし)');
  $('.item-preview', node).textContent = isNew ? '' : item.value;

  const open = state.openKey === key;
  node.classList.toggle('open', open);
  $('.item-body', node).hidden = !open;

  $('.item-head', node).addEventListener('click', () => {
    state.openKey = open ? null : key;
    render();
  });

  if (open) fillForm(node, item, isNew);
  return node;
}

function fillForm(node, item, isNew) {
  const fKey = $('.f-key', node);
  const fValue = $('.f-value', node);

  fKey.value = item.key;
  fValue.value = item.value;

  $('.a-save', node).addEventListener('click', () =>
    saveItem(isNew ? null : item, { key: fKey.value, value: fValue.value })
  );

  $('.a-format', node).addEventListener('click', () => {
    try {
      fValue.value = JSON.stringify(JSON.parse(fValue.value), null, 2);
      toast('JSONとして整形しました');
    } catch {
      toast('値がJSONではありません', true);
    }
  });

  $('.a-env', node).addEventListener('click', async () => {
    if (!fKey.value && !fValue.value) {
      toast('コピーする内容がありません', true);
      return;
    }
    await navigator.clipboard.writeText(`${envKey(fKey.value)}=${fValue.value}`);
    toast(`${envKey(fKey.value)} をenv形式でコピーしました`);
  });

  const delBtn = $('.a-delete', node);
  if (isNew) {
    delBtn.textContent = 'キャンセル';
    delBtn.addEventListener('click', () => {
      state.openKey = null;
      render();
    });
  } else {
    delBtn.addEventListener('click', () => deleteItem(item));
  }
}

/* ---------- mutations ---------- */

async function saveItem(orig, form) {
  if (!form.key) {
    toast('キーを入力してください', true);
    return;
  }
  if (form.key !== orig?.key && state.items.some((it) => it.key === form.key)) {
    toast(`キー「${form.key}」は既に存在します`, true);
    return;
  }
  try {
    if (orig && orig.key !== form.key) {
      await execInPage(pageRemove, [orig.key]);
    }
    await execInPage(pageSet, [form.key, form.value]);
    state.openKey = form.key;
    toast('保存しました');
    await reload();
  } catch (e) {
    toast(`保存エラー: ${e.message}`, true);
  }
}

async function deleteItem(item) {
  try {
    await execInPage(pageRemove, [item.key]);
    state.openKey = null;
    toast(`「${item.key}」を削除しました`);
    await reload();
  } catch (e) {
    toast(`削除エラー: ${e.message}`, true);
  }
}

async function deleteAll() {
  try {
    const n = await execInPage(pageClear);
    state.openKey = null;
    toast(`${n} 件のアイテムを削除しました`);
    await reload();
  } catch (e) {
    toast(`削除エラー: ${e.message}`, true);
  }
}

/* ---------- import / export ---------- */

async function exportItems() {
  if (!state.items.length) {
    toast('エクスポートするアイテムがありません', true);
    return;
  }
  const obj = Object.fromEntries(state.items.map((it) => [it.key, it.value]));
  await navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
  toast(`${state.items.length} 件をクリップボードにコピーしました`);
}

function envKey(key) {
  return key.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
}

async function exportEnv() {
  if (!state.items.length) {
    toast('コピーするアイテムがありません', true);
    return;
  }
  const text = state.items.map((it) => `${envKey(it.key)}=${it.value}`).join('\n');
  await navigator.clipboard.writeText(text);
  toast(`${state.items.length} 件をenv形式でコピーしました`);
}

async function importItems(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    toast('JSONを解析できません', true);
    return;
  }

  let entries;
  if (Array.isArray(parsed)) {
    // [{ key, value }] 形式も受け付ける
    entries = parsed
      .filter((it) => it && typeof it === 'object' && typeof it.key === 'string')
      .map((it) => [it.key, stringify(it.value)]);
  } else if (parsed && typeof parsed === 'object') {
    entries = Object.entries(parsed).map(([k, v]) => [k, stringify(v)]);
  } else {
    toast('オブジェクトまたは配列を貼り付けてください', true);
    return;
  }

  if (!entries.length) {
    toast('インポートできるアイテムがありません', true);
    return;
  }

  try {
    const ok = await execInPage(pageImport, [entries]);
    const fail = entries.length - ok;
    toast(`インポート: 成功 ${ok} 件${fail ? ` / 失敗 ${fail} 件` : ''}`, !ok);
    await reload();
  } catch (e) {
    toast(`インポートエラー: ${e.message}`, true);
  }
}

function stringify(v) {
  return typeof v === 'string' ? v : JSON.stringify(v);
}

/* ---------- events ---------- */

$('#search').addEventListener('input', (e) => {
  state.filter = e.target.value;
  render();
});

$('#btn-reload').addEventListener('click', () => {
  reload();
  toast('再読み込みしました');
});

$('#btn-add').addEventListener('click', () => {
  if (state.tabId == null) return;
  state.openKey = NEW_KEY;
  render();
  $('#list .f-key')?.focus();
});

$('#btn-export').addEventListener('click', () => exportItems().catch((e) => toast(e.message, true)));

$('#btn-env').addEventListener('click', () => exportEnv().catch((e) => toast(e.message, true)));

$('#btn-import').addEventListener('click', () => {
  const panel = $('#import-panel');
  panel.hidden = !panel.hidden;
  if (!panel.hidden) $('#import-text').focus();
});
$('#btn-import-cancel').addEventListener('click', () => {
  $('#import-panel').hidden = true;
  $('#import-text').value = '';
});
$('#btn-import-run').addEventListener('click', async () => {
  const text = $('#import-text').value.trim();
  if (!text) return;
  await importItems(text);
  $('#import-panel').hidden = true;
  $('#import-text').value = '';
});

{
  let confirmTimer;
  $('#btn-clear').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    if (btn.classList.contains('confirming')) {
      btn.classList.remove('confirming');
      clearTimeout(confirmTimer);
      deleteAll();
    } else {
      btn.classList.add('confirming');
      btn.title = 'もう一度クリックで全削除';
      toast('もう一度クリックすると全削除します');
      confirmTimer = setTimeout(() => {
        btn.classList.remove('confirming');
        btn.title = 'すべて削除';
      }, 3000);
    }
  });
}

init();
