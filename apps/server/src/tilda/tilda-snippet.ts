/**
 * Скрипт и стили, которые клиент вставляет на страницу Тильды.
 *
 * Отдаются с нашего домена по адресу с токеном интеграции: так клиенту
 * не нужно ничего настраивать, кроме вставки двух строк в HEAD.
 *
 * Скрипт перехватывает отправку формы и ведёт человека через подтверждение
 * адреса, не уводя со страницы.
 */

export interface PublicConfig {
  token: string;
  authMode: 'none' | 'email_code';
  successMessage: string;
  showDownload: boolean;
  /** Тексты согласий: показываются в форме и попадают в журнал вместе с версией. */
  consentText: string;
  consentVersion: string;
}

export const TILDA_STYLES = `
.vru-overlay{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;
  background:rgba(16,21,15,.45);font-family:system-ui,-apple-system,sans-serif}
.vru-card{background:#fff;color:#16211c;border-radius:16px;padding:28px;max-width:380px;
  width:calc(100% - 32px);box-shadow:0 12px 40px rgba(0,0,0,.18);text-align:center}
.vru-title{font-size:18px;font-weight:600;margin:0 0 8px}
.vru-text{font-size:14px;color:#5f6b64;margin:0 0 18px;line-height:1.45}
.vru-code{width:100%;font-size:24px;letter-spacing:.3em;text-align:center;padding:12px;
  border:1px solid #cfccc2;border-radius:10px;outline:none}
.vru-code:focus{border-color:#1f5d3f;box-shadow:0 0 0 3px rgba(31,93,63,.15)}
.vru-btn{margin-top:14px;width:100%;padding:11px;border:0;border-radius:10px;cursor:pointer;
  background:#1f5d3f;color:#fff;font-size:15px;font-weight:500}
.vru-btn:disabled{opacity:.6;cursor:default}
.vru-err{color:#a3302a;font-size:13px;margin-top:10px;min-height:18px}
.vru-close{position:absolute;top:14px;right:16px;border:0;background:none;cursor:pointer;
  font-size:22px;color:#5f6b64;line-height:1}
.vru-spin{width:26px;height:26px;margin:0 auto 14px;border:3px solid #e3e1da;
  border-top-color:#1f5d3f;border-radius:50%;animation:vru-rot .8s linear infinite}
@keyframes vru-rot{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.vru-spin{animation-duration:3s}}
`.trim();

/** Экранирование для безопасной вставки строки в JavaScript-литерал. */
function js(value: string): string {
  return JSON.stringify(value);
}

export function buildTildaScript(baseUrl: string, config: PublicConfig): string {
  return `/* Вручай — выдача наградных документов. Форма на этой странице. */
(function () {
  'use strict';
  var API = ${js(baseUrl)};
  var CFG = {
    token: ${js(config.token)},
    authMode: ${js(config.authMode)},
    successMessage: ${js(config.successMessage)},
    showDownload: ${config.showDownload},
    consentVersion: ${js(config.consentVersion)}
  };

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    // Только наша собственная разметка: пользовательские данные сюда не попадают.
    if (html) n.innerHTML = html;
    return n;
  }

  function overlay(inner) {
    var o = el('div', 'vru-overlay');
    var card = el('div', 'vru-card');
    card.style.position = 'relative';
    var close = el('button', 'vru-close', '&times;');
    close.setAttribute('aria-label', 'Закрыть');
    close.onclick = function () { o.remove(); };
    card.appendChild(close);
    card.appendChild(inner);
    o.appendChild(card);
    document.body.appendChild(o);
    return o;
  }

  function post(path, body) {
    return fetch(API + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error(data && data.message ? data.message : 'Что-то пошло не так');
        return data;
      });
    });
  }

  function showWaiting(requestId, box) {
    box.innerHTML = '';
    box.appendChild(el('div', 'vru-spin'));
    box.appendChild(el('p', 'vru-title', 'Готовим документ'));
    box.appendChild(el('p', 'vru-text', 'Это займёт несколько секунд'));

    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      // Полторы минуты ожидания: дольше — почти наверняка сбой.
      if (tries > 90) { clearInterval(timer); return fail(box, 'Документ готовится дольше обычного. Проверьте почту через несколько минут'); }
      fetch(API + '/api/v1/tilda/status/' + requestId)
        .then(function (r) { return r.json(); })
        .then(function (s) {
          if (s.status === 'done') {
            clearInterval(timer);
            done(box, requestId, s);
          } else if (s.status === 'failed' || s.status === 'rejected') {
            clearInterval(timer);
            fail(box, s.error || 'Не удалось создать документ');
          }
        })
        .catch(function () { /* сеть моргнула — попробуем на следующем тике */ });
    }, 1000);
  }

  function done(box, requestId, status) {
    box.innerHTML = '';
    box.appendChild(el('p', 'vru-title', 'Готово'));
    box.appendChild(el('p', 'vru-text', CFG.successMessage));
    if (CFG.showDownload && status.canDownload) {
      var a = el('a', 'vru-btn', 'Скачать документ');
      a.href = API + '/api/v1/tilda/download/' + requestId;
      a.style.display = 'block';
      a.style.textDecoration = 'none';
      a.style.boxSizing = 'border-box';
      box.appendChild(a);
    }
  }

  function fail(box, message) {
    box.innerHTML = '';
    box.appendChild(el('p', 'vru-title', 'Не получилось'));
    var p = el('p', 'vru-text');
    p.textContent = message;
    box.appendChild(p);
  }

  function askCode(requestId, box) {
    box.innerHTML = '';
    box.appendChild(el('p', 'vru-title', 'Введите код из письма'));
    box.appendChild(el('p', 'vru-text', 'Мы отправили шестизначный код, чтобы убедиться, что адрес ваш'));
    var input = el('input', 'vru-code');
    input.inputMode = 'numeric';
    input.maxLength = 6;
    input.setAttribute('aria-label', 'Код подтверждения');
    var btn = el('button', 'vru-btn', 'Подтвердить');
    var err = el('div', 'vru-err');
    box.appendChild(input);
    box.appendChild(btn);
    box.appendChild(err);
    input.focus();

    btn.onclick = function () {
      err.textContent = '';
      btn.disabled = true;
      post('/api/v1/tilda/confirm', { requestId: requestId, code: input.value })
        .then(function () { showWaiting(requestId, box); })
        .catch(function (e) { err.textContent = e.message; btn.disabled = false; });
    };
    input.onkeydown = function (e) { if (e.key === 'Enter') btn.click(); };
  }

  function collect(form) {
    var out = { fields: {}, email: '', consent: false, consentMarketing: false, documentId: '', website: '' };
    var inputs = form.querySelectorAll('input, select, textarea');
    for (var i = 0; i < inputs.length; i++) {
      var f = inputs[i];
      var name = (f.name || '').trim();
      if (!name) continue;
      if (name === 'doc_id') { out.documentId = f.value.trim(); continue; }
      if (name === 'website') { out.website = f.value.trim(); continue; }
      if (name === 'consent') { out.consent = f.checked; continue; }
      if (name === 'consent_marketing') { out.consentMarketing = f.checked; continue; }
      if (f.type === 'email' || name === 'email') { out.email = f.value.trim(); continue; }
      if (f.type === 'checkbox' && !f.checked) continue;
      // Имя переменной документа должно быть латинским — как в макете.
      if (/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) out.fields[name] = f.value;
    }
    return out;
  }

  function handle(form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      e.stopPropagation();

      var data = collect(form);
      var box = el('div');
      overlay(box);

      if (!data.consent) {
        return fail(box, 'Отметьте согласие на обработку персональных данных');
      }

      box.appendChild(el('div', 'vru-spin'));
      box.appendChild(el('p', 'vru-title', 'Отправляем заявку'));

      post('/api/v1/tilda/submit', {
        token: CFG.token,
        documentId: data.documentId,
        email: data.email,
        fields: data.fields,
        consent: true,
        consentMarketing: data.consentMarketing,
        consentVersion: CFG.consentVersion,
        website: data.website
      })
        .then(function (r) {
          if (r.status === 'need_code') return askCode(r.requestId, box);
          // Документ выдавали раньше: спрашиваем, доступен ли он ещё
          // для скачивания, вместо того чтобы обещать кнопку наугад.
          if (r.status === 'already_issued') {
            return fetch(API + '/api/v1/tilda/status/' + r.requestId)
              .then(function (res) { return res.json(); })
              .then(function (s) { done(box, r.requestId, s); })
              .catch(function () { done(box, r.requestId, { canDownload: false }); });
          }
          showWaiting(r.requestId, box);
        })
        .catch(function (err) { fail(box, err.message); });
    }, true);
  }

  function init() {
    // Формы Тильды и обычные формы с признаком нашей интеграции.
    var forms = document.querySelectorAll('form.t-form, form[data-vruchay]');
    for (var i = 0; i < forms.length; i++) handle(forms[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();`;
}
