import zhCN from './zh-CN.js?v=8b7457d1d7688be4';
import en from './en.js?v=8b7457d1d7688be4';

const dictionaries = { 'zh-CN': zhCN, en };
const storageKey = 'zhouyi.language';
const listeners = new Set();

function normalizeLanguage(value) {
  return String(value || '').toLowerCase().startsWith('en') ? 'en' : 'zh-CN';
}

function initialLanguage() {
  const query = new URLSearchParams(location.search).get('lang');
  if (query) return normalizeLanguage(query);
  const saved = localStorage.getItem(storageKey);
  if (saved) return normalizeLanguage(saved);
  return normalizeLanguage(navigator.language);
}

let language = initialLanguage();

export function getLanguage() { return language; }

export function t(key, params = {}) {
  const template = dictionaries[language][key] ?? dictionaries['zh-CN'][key] ?? key;
  return String(template).replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`);
}

export function translateDocument(root = document) {
  document.documentElement.lang = language;
  document.title = t('meta.title');
  root.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = t(element.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach(element => { element.innerHTML = t(element.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-aria]').forEach(element => { element.setAttribute('aria-label', t(element.dataset.i18nAria)); });
  root.querySelectorAll('[data-i18n-title]').forEach(element => { element.title = t(element.dataset.i18nTitle); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(element => { element.placeholder = t(element.dataset.i18nPlaceholder); });
  root.querySelectorAll('[data-language]').forEach(button => {
    const active = button.dataset.language === language;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

export function setLanguage(nextLanguage) {
  const next = normalizeLanguage(nextLanguage);
  const changed = next !== language;
  language = next;
  localStorage.setItem(storageKey, language);
  const url = new URL(location.href);
  url.searchParams.set('lang', language === 'en' ? 'en' : 'zh-CN');
  history.replaceState(null, '', url);
  translateDocument();
  if (changed) listeners.forEach(listener => listener(language));
}

export function onLanguageChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
