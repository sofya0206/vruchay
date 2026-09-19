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
  /** Подпись у галочки согласия: показывается в окне и попадает в журнал с версией. */
  consentText: string;
  /** Куда ведёт ссылка «подробнее» рядом с галочкой. */
  privacyUrl: string;
  consentVersion: string;
  /** Подставлять имя и адрес из личного кабинета площадки. */
  prefillFromAccount: boolean;
  /** Можно ли править подставленное. Выключено — только подтвердить. */
  allowEdit: boolean;
  showShare: boolean;
  showVerifyLink: boolean;
}

/*
 * Цвета, радиусы и шрифт — из UI-кита кабинета (apps/web/src/index.css:
 * --accent, --text, --line и остальные). Стили живут на чужой странице,
 * переменных кита там нет, поэтому значения переписаны числами — при смене
 * кита их надо поправить и здесь. Jost подхватится, если он есть у сайта;
 * иначе системный шрифт, грузить свой с нашего домена на чужую страницу
 * не стали.
 */
export const TILDA_STYLES = `
.vru-overlay{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;
  background:rgba(9,17,53,.4);font-family:'Jost',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
.vru-card{position:relative;box-sizing:border-box;background:#fff;color:#091135;border-radius:16px;
  padding:28px;max-width:380px;width:calc(100% - 32px);max-height:90vh;overflow-y:auto;
  overscroll-behavior:contain;box-shadow:0 12px 40px rgba(9,17,53,.18);text-align:center}
.vru-title{font-size:18px;font-weight:600;margin:0 0 8px}
.vru-text{font-size:14px;color:#36394a;margin:0 0 18px;line-height:1.45}
.vru-code{box-sizing:border-box;width:100%;font-size:24px;letter-spacing:.3em;text-align:center;padding:12px;
  border:1px solid #b1bbcd;border-radius:8px;outline:none;color:#091135}
.vru-code:focus{border-color:#0f77ff;box-shadow:0 0 0 3px rgba(15,119,255,.18)}
.vru-btn{margin-top:14px;width:100%;padding:11px;border:0;border-radius:8px;cursor:pointer;
  background:#127ee3;color:#fff;font:inherit;font-size:15px;font-weight:500}
.vru-btn:hover{background:#0f6ac1}
.vru-btn:disabled{opacity:.6;cursor:default}
.vru-err{color:#d92d3f;font-size:13px;margin-top:10px;min-height:18px}
.vru-close{position:absolute;top:6px;right:6px;width:44px;height:44px;display:grid;place-items:center;
  border:0;border-radius:8px;background:none;cursor:pointer;font-size:24px;color:#36394a;line-height:1}
.vru-close:hover{background:#f5f3ff}
.vru-field{text-align:left;margin-bottom:12px}
.vru-label{display:block;font-size:13px;color:#36394a;margin-bottom:4px}
.vru-input{width:100%;box-sizing:border-box;padding:10px 12px;font:inherit;font-size:16px;
  border:1px solid #b1bbcd;border-radius:8px;outline:none;background:#fff;color:#091135}
.vru-input:focus{border-color:#0f77ff;box-shadow:0 0 0 3px rgba(15,119,255,.18)}
.vru-input[readonly]{background:#f5f3ff;color:#36394a}
/* Флажок согласия. Рисуем свой: системный квадратик в каждой системе
   свой и рядом с кнопкой виджета выглядит чужой заплатой.
   Вход остаётся настоящим — это чужая страница, и терять из-за
   внешности клавиатуру, диктор и required там нельзя. */
.vru-check{appearance:none;-webkit-appearance:none;flex:0 0 auto;width:18px;height:18px;
  margin:1px 0 0;border:1px solid #b1bbcd;border-radius:5px;background:#fff;cursor:pointer;
  display:inline-grid;place-content:center;transition:background .15s,border-color .15s}
.vru-check::after{content:'';width:10px;height:6px;border:2px solid #fff;border-top:0;
  border-right:0;transform:rotate(-45deg) translate(1px,-1px);opacity:0}
.vru-check:checked{background:#127ee3;border-color:#127ee3}
.vru-check:checked::after{opacity:1}
.vru-check:focus-visible{outline:2px solid #0f77ff;outline-offset:2px}
.vru-ghost{margin-top:10px;width:100%;padding:10px;border:1px solid #e1e9f0;border-radius:8px;
  cursor:pointer;background:#fff;color:#091135;font:inherit;font-size:14px}
.vru-ghost:hover{background:#f5f3ff}
.vru-share{display:flex;gap:8px;justify-content:center;margin-top:14px;flex-wrap:wrap}
.vru-share a,.vru-share button{display:inline-flex;align-items:center;justify-content:center;
  padding:8px 14px;border:1px solid #e1e9f0;border-radius:8px;background:#fff;color:#091135;
  font:inherit;font-size:13px;text-decoration:none;cursor:pointer}
.vru-verify{display:block;margin-top:12px;font-size:13px;color:#127ee3}
.vru-list{display:flex;flex-direction:column;gap:8px;margin:14px 0;text-align:left}
.vru-item{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;
  border:1px solid #e1e9f0;border-radius:8px;color:#091135;text-decoration:none;font-size:14px}
.vru-item:hover{border-color:#127ee3}
.vru-item-date{color:#36394a;white-space:nowrap}
.vru-spin{width:26px;height:26px;margin:0 auto 14px;border:3px solid #e1e9f0;
  border-top-color:#127ee3;border-radius:50%;animation:vru-rot .8s linear infinite}
@keyframes vru-rot{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.vru-spin{animation-duration:3s}}
/* Телефон. Форму открывают сканом QR на мероприятии, почти всегда с телефона.
   Окно — листом снизу: кнопка оказывается под большим пальцем, а длинный шаг
   с согласием прокручивается внутри листа, а не уезжает за экран вместе
   с клавиатурой. Поля 16px — мельче Safari на iOS увеличивает страницу. */
@media (max-width:560px){
  .vru-overlay{place-items:end center}
  .vru-card{width:100%;max-width:none;max-height:92vh;border-radius:18px 18px 0 0;
    padding:28px 20px max(20px,env(safe-area-inset-bottom))}
}
@media (pointer:coarse){
  .vru-btn{min-height:48px}
  .vru-ghost,.vru-share a,.vru-share button,.vru-item{min-height:44px}
  .vru-verify{padding:12px 0}
}
`.trim();

/** Экранирование для безопасной вставки строки в JavaScript-литерал. */
function js(value: string): string {
  return JSON.stringify(value);
}

export function buildTildaScript(baseUrl: string, config: PublicConfig): string {
  return `/* Вручай — выдача наградных документов. Форма на этой странице. */
(function () {
  'use strict';

  // Скрипт можно подключать хоть в HEAD, хоть рядом с самим блоком —
  // так проще объяснять, и не надо лезть в шаблон сайта. Но тогда на
  // странице с двумя блоками он загрузится дважды, и вторая загрузка
  // навесила бы вторую кнопку на каждый блок.
  if (window.__vruchayLoaded) return;
  window.__vruchayLoaded = true;

  var API = ${js(baseUrl)};
  var CFG = {
    token: ${js(config.token)},
    authMode: ${js(config.authMode)},
    successMessage: ${js(config.successMessage)},
    showDownload: ${config.showDownload},
    consentVersion: ${js(config.consentVersion)},
    consentText: ${js(config.consentText)},
    privacyUrl: ${js(config.privacyUrl)},
    prefill: ${config.prefillFromAccount},
    allowEdit: ${config.allowEdit},
    showShare: ${config.showShare}
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
    // Делимся ссылкой на страницу проверки, а не самим файлом: файл
    // отдаётся по временной ссылке и вдобавок содержит фамилию с адресом,
    // а страница проверки для того и сделана, чтобы её показывать.
    if (CFG.showShare && status.verifyUrl) shareRow(box, status.verifyUrl);
    if (status.verifyUrl) {
      var v = el('a', 'vru-verify', 'Проверить подлинность документа');
      v.href = status.verifyUrl;
      v.target = '_blank';
      v.rel = 'noopener';
      box.appendChild(v);
    }
  }

  function shareRow(box, url) {
    var row = el('div', 'vru-share');
    var text = 'Мой документ';
    var links = [
      ['ВКонтакте', 'https://vk.com/share.php?url=' + encodeURIComponent(url)],
      ['Telegram', 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text)],
      ['WhatsApp', 'https://wa.me/?text=' + encodeURIComponent(text + ' ' + url)]
    ];
    for (var i = 0; i < links.length; i++) {
      var a = el('a', null, links[i][0]);
      a.href = links[i][1];
      a.target = '_blank';
      a.rel = 'noopener';
      row.appendChild(a);
    }
    // Кнопка «скопировать» нужна тем, у кого своя сеть или мессенджер,
    // которого в списке нет. Их всегда больше, чем кажется.
    var copy = el('button', null, 'Скопировать ссылку');
    copy.onclick = function () {
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(url).then(function () {
        copy.textContent = 'Скопировано';
      }, function () { /* доступ к буферу запрещён — молчим, ссылка видна */ });
    };
    row.appendChild(copy);
    box.appendChild(row);
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
    // Код из письма телефон предложит подставить сам — без переключения в почту.
    input.autocomplete = 'one-time-code';
    input.setAttribute('enterkeyhint', 'done');
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

  /**
   * Имя и адрес вошедшего участника.
   *
   * Три источника по убыванию надёжности.
   *
   * 1. Атрибуты самого блока — их площадка подставляет **своим шаблоном
   *    на сервере**: WordPress через короткий код, Битрикс через $USER.
   *    Это и надёжнее, и понятнее: видно, откуда взялось значение.
   * 2. Поля ma_name и ma_email — так делает личный кабинет Тильды.
   * 3. Глобальный объект площадки — на случай, если она кладёт данные туда.
   *
   * Ничего не требуем: не нашли — человек наберёт сам. Сценарий обязан
   * работать и без подстановки, иначе на любой новой площадке кнопка
   * просто переставала бы что-либо делать.
   */
  function account(node) {
    var out = { name: '', email: '' };
    if (!CFG.prefill) return out;

    if (node) {
      out.name = (node.getAttribute('data-name') || '').trim();
      out.email = (node.getAttribute('data-email') || '').trim();
    }

    var byName = function (n) {
      var f = document.querySelector('[name="' + n + '"]');
      return f && f.value ? String(f.value).trim() : '';
    };
    if (!out.name) out.name = byName('ma_name');
    if (!out.email) out.email = byName('ma_email');

    try {
      var m = window.tildamembers || window.tildaMembers || window.vruchayUser;
      if (m) {
        if (!out.name && m.name) out.name = String(m.name).trim();
        if (!out.email && m.email) out.email = String(m.email).trim();
      }
    } catch (e) { /* чужой объект оказался не тем, чем ожидали */ }

    return out;
  }

  function send(box, payload) {
    box.innerHTML = '';
    box.appendChild(el('div', 'vru-spin'));
    box.appendChild(el('p', 'vru-title', 'Отправляем заявку'));

    post('/api/v1/tilda/submit', payload)
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
  }

  /**
   * Окно «проверьте данные».
   *
   * Показывается там, где человек ничего не набирал: данные подставлены
   * кабинетом, и подтвердить их он обязан сам. Без этого шага сервис
   * впечатал бы в наградной документ то, что где-то лежало, — а исправить
   * фамилию в уже выданном документе куда дороже, чем прочитать её сейчас.
   */
  function confirmStep(box, documentId, prefill) {
    box.innerHTML = '';
    box.appendChild(el('p', 'vru-title', 'Проверьте данные'));
    box.appendChild(el('p', 'vru-text',
      CFG.allowEdit
        ? 'Так они будут напечатаны в документе. Если что-то не так — поправьте.'
        : 'Так они будут напечатаны в документе.'));

    var mk = function (label, value, type, auto) {
      var wrap = el('div', 'vru-field');
      var l = el('label', 'vru-label');
      l.textContent = label;
      var input = el('input', 'vru-input');
      input.type = type || 'text';
      input.value = value || '';
      // Подсказки клавиатуре телефона: имя — с заглавной и из контакта,
      // почта — без автозамены и заглавных, адрес подставляется сам.
      input.id = 'vru-f-' + Math.random().toString(36).slice(2, 8);
      l.htmlFor = input.id;
      if (auto) input.autocomplete = auto;
      input.setAttribute('autocapitalize', type === 'email' ? 'none' : 'words');
      if (type === 'email') input.spellcheck = false;
      input.setAttribute('enterkeyhint', 'next');
      if (!CFG.allowEdit) input.readOnly = true;
      wrap.appendChild(l);
      wrap.appendChild(input);
      box.appendChild(wrap);
      return input;
    };

    var nameInput = mk('Фамилия и имя', prefill.name, 'text', 'name');
    var emailInput = mk('Куда прислать документ', prefill.email, 'email', 'email');

    var consent = el('label', 'vru-label');
    consent.style.display = 'flex';
    consent.style.gap = '8px';
    consent.style.alignItems = 'flex-start';
    consent.style.textAlign = 'left';
    var check = el('input', 'vru-check');
    check.type = 'checkbox';
    var span = el('span');
    // textContent, а не innerHTML: текст приходит из настроек, и вставлять
    // его как разметку значило бы открыть путь чужому скрипту на страницу
    // клиента.
    span.textContent = CFG.consentText + ' ';
    var more = el('a', null, 'Подробнее');
    more.href = CFG.privacyUrl;
    more.target = '_blank';
    more.rel = 'noopener';
    more.style.color = '#127ee3';
    span.appendChild(more);
    consent.appendChild(check);
    consent.appendChild(span);
    box.appendChild(consent);

    var btn = el('button', 'vru-btn', 'Всё верно, получить документ');
    var err = el('div', 'vru-err');
    box.appendChild(btn);
    box.appendChild(err);

    btn.onclick = function () {
      err.textContent = '';
      if (!check.checked) {
        err.textContent = 'Отметьте согласие на обработку персональных данных';
        return;
      }
      if (!emailInput.value.trim()) {
        err.textContent = 'Укажите адрес, куда прислать документ';
        return;
      }
      send(box, {
        token: CFG.token,
        documentId: documentId,
        email: emailInput.value.trim(),
        // Адрес учётной записи идёт отдельно от адреса доставки: по нему
        // держится однократная выдача, даже если доставку разрешено менять.
        accountEmail: prefill.email || undefined,
        fields: { name: nameInput.value.trim() },
        consent: true,
        consentMarketing: false,
        consentVersion: CFG.consentVersion
      });
    };
  }

  /**
   * «Мои документы»: перечень всего, что выдавали на этот адрес.
   *
   * Код спрашивается всегда, даже в кабинете: один документ без проверки —
   * риск организатора, а перечень по чужому адресу — уже раскрытие того,
   * где человек участвовал.
   */
  function myDocuments(box, prefill) {
    box.innerHTML = '';
    box.appendChild(el('p', 'vru-title', 'Мои документы'));
    box.appendChild(el('p', 'vru-text', 'Укажите почту, на которую получали документы'));
    var wrap = el('div', 'vru-field');
    var input = el('input', 'vru-input');
    input.type = 'email';
    input.value = prefill.email || '';
    input.autocomplete = 'email';
    input.setAttribute('autocapitalize', 'none');
    input.spellcheck = false;
    input.setAttribute('enterkeyhint', 'go');
    input.setAttribute('aria-label', 'Почта');
    wrap.appendChild(input);
    box.appendChild(wrap);
    var btn = el('button', 'vru-btn', 'Показать документы');
    var err = el('div', 'vru-err');
    box.appendChild(btn);
    box.appendChild(err);
    if (!input.value) input.focus();

    btn.onclick = function () {
      err.textContent = '';
      var email = input.value.trim();
      if (!email) { err.textContent = 'Укажите почту'; return; }
      btn.disabled = true;
      post('/api/v1/tilda/my', { token: CFG.token, email: email, accountEmail: prefill.email || undefined })
        .then(function (r) { myCode(r.listId, box); })
        .catch(function (e) { err.textContent = e.message; btn.disabled = false; });
    };
    input.onkeydown = function (e) { if (e.key === 'Enter') btn.click(); };
  }

  function myCode(listId, box) {
    box.innerHTML = '';
    box.appendChild(el('p', 'vru-title', 'Введите код из письма'));
    box.appendChild(el('p', 'vru-text', 'Мы отправили шестизначный код, чтобы убедиться, что адрес ваш'));
    var input = el('input', 'vru-code');
    input.inputMode = 'numeric';
    input.maxLength = 6;
    // Код из письма телефон предложит подставить сам — без переключения в почту.
    input.autocomplete = 'one-time-code';
    input.setAttribute('enterkeyhint', 'done');
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
      post('/api/v1/tilda/my/confirm', { listId: listId, code: input.value })
        .then(function (r) { myList(listId, r.items, box); })
        .catch(function (e) { err.textContent = e.message; btn.disabled = false; });
    };
    input.onkeydown = function (e) { if (e.key === 'Enter') btn.click(); };
  }

  function myList(listId, items, box) {
    box.innerHTML = '';
    box.appendChild(el('p', 'vru-title', 'Мои документы'));
    if (!items.length) {
      box.appendChild(el('p', 'vru-text', 'На этот адрес документов пока не выдавали'));
      return;
    }
    var list = el('div', 'vru-list');
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var a = el('a', 'vru-item');
      a.href = API + '/api/v1/tilda/my/' + listId + '/download/' + item.requestId;
      var t = el('span', 'vru-item-title');
      // textContent: название документа задаёт организатор, и вставлять
      // его как разметку на чужую страницу нельзя.
      t.textContent = item.title;
      var d = el('span', 'vru-item-date');
      d.textContent = new Date(item.issuedAt).toLocaleDateString('ru-RU');
      a.appendChild(t);
      a.appendChild(d);
      list.appendChild(a);
    }
    box.appendChild(list);
    box.appendChild(el('p', 'vru-text', 'Ссылки действуют час'));
  }

  function handle(form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      e.stopPropagation();

      var data = collect(form);
      var box = el('div');
      overlay(box);

      // doc_id=all — так список просили у сервиса, который мы заменяем.
      if (data.documentId.toLowerCase() === 'all') {
        var acc0 = account(form);
        return myDocuments(box, { email: data.email || acc0.email });
      }

      if (!data.consent) {
        return fail(box, 'Отметьте согласие на обработку персональных данных');
      }

      var acc = account(form);
      send(box, {
        token: CFG.token,
        documentId: data.documentId,
        email: data.email || acc.email,
        accountEmail: acc.email || undefined,
        fields: data.fields,
        consent: true,
        consentMarketing: data.consentMarketing,
        consentVersion: CFG.consentVersion,
        website: data.website
      });
    }, true);
  }

  /**
   * Вход одной кнопкой — без формы вообще.
   *
   * Клиенту достаточно положить на страницу курса один блок с кодом
   * документа. Собирать форму из полей, которые всё равно заполнятся
   * сами, — лишняя работа и лишний повод ошибиться.
   */
  function initButtons() {
    var nodes = document.querySelectorAll('[data-vruchay-certificate]');
    for (var i = 0; i < nodes.length; i++) {
      (function (node) {
        // Один блок — одна кнопка, сколько бы раз ни звали.
        if (node.getAttribute('data-vruchay-ready')) return;
        node.setAttribute('data-vruchay-ready', '1');

        var documentId = (node.getAttribute('data-doc-id') || '').trim();
        if (!documentId) return;

        var btn = el('button', 'vru-btn', node.getAttribute('data-label') || 'Получить документ');
        btn.style.width = 'auto';
        btn.style.padding = '11px 22px';
        btn.onclick = function () {
          var box = el('div');
          overlay(box);
          // Данные берём у самого блока: на странице может стоять
          // несколько кнопок на разные документы, и каждой полагаются
          // свои значения, а не первые попавшиеся на странице.
          confirmStep(box, documentId, account(node));
        };
        node.appendChild(btn);
      })(nodes[i]);
    }
  }

  function initMyButtons() {
    var nodes = document.querySelectorAll('[data-vruchay-my]');
    for (var i = 0; i < nodes.length; i++) {
      (function (node) {
        if (node.getAttribute('data-vruchay-ready')) return;
        node.setAttribute('data-vruchay-ready', '1');
        var btn = el('button', 'vru-btn', node.getAttribute('data-label') || 'Мои документы');
        btn.style.width = 'auto';
        btn.style.padding = '11px 22px';
        btn.onclick = function () {
          var box = el('div');
          overlay(box);
          myDocuments(box, account(node));
        };
        node.appendChild(btn);
      })(nodes[i]);
    }
  }

  function init() {
    // Формы Тильды и обычные формы с признаком нашей интеграции.
    var forms = document.querySelectorAll('form.t-form, form[data-vruchay]');
    for (var i = 0; i < forms.length; i++) handle(forms[i]);
    initButtons();
    initMyButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();`;
}
