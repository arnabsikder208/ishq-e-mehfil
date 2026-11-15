(() => {
  'use strict';
  const API = (window.API_BASE || '').replace(/\/$/, '') + '/api';
  const $ = (id) => document.getElementById(id);
  const el = {
    verifyScreen: $('verifyScreen'),
    serial: $('serial'),
    verifyBtn: $('verifyBtn'),
    inlineError: $('inlineError'),
    overlay: $('overlay'),
    modal: $('modal'),
    mIcon: $('mIcon'),
    mTitle: $('mTitle'),
    mText: $('mText'),
    mDetails: $('mDetails'),
    mBanner: $('mBanner'),
    again: $('againBtn'),
    offline: $('offline')
  };

  let busy = false;
  let modalOpen = false;

  /* ---------- Icons ---------- */
  const ICON = {
    ok: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    warn: '<span>!</span>',
    err: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  };

/* ---------- Input hygiene (Allows alphanumeric & hyphens like IEM-C24E3E) ---------- */
  el.serial.addEventListener('input', () => {
    // Allow letters, numbers, and hyphens, and convert to uppercase for consistency
    const clean = el.serial.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (clean !== el.serial.value) el.serial.value = clean;
    el.inlineError.hidden = true;
  });

  el.serial.addEventListener('keydown', (e) => { 
    if (e.key === 'Enter') { 
      e.preventDefault(); 
      verify(); 
    } 
  });

  el.verifyBtn.onclick = verify;

  /* ---------- Verification ---------- */
  function setBusy(v) { 
    busy = v; 
    el.verifyBtn.disabled = v; 
    el.verifyBtn.classList.toggle('loading', v); 
    el.serial.readOnly = v; 
  }

  function showInline(msg) { 
    el.inlineError.textContent = msg; 
    el.inlineError.hidden = false; 
  }

  async function verify() {
    if (busy || modalOpen) return;
    const serialNo = el.serial.value.trim();
    if (!serialNo) { showInline('Enter the ticket serial number.'); el.serial.focus(); return; }
    if (!navigator.onLine) { showInline('You are offline. Ticket was NOT verified.'); return; }
    setBusy(true); el.inlineError.hidden = true;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(API + '/verify', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-staff-id': 'gate-1' },
        body: JSON.stringify({ serialNo }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 400) { showInline(data.message); return; }
      if (!res.ok || !data.status || data.status === 'error') return serverError(data.message);
      if (data.stats) renderStats(data.stats);
      if (data.status === 'verified') showResult('ok', data.ticket);
      else if (data.status === 'already_verified') showResult('warn', data.ticket);
      else if (data.status === 'invalid') showResult('err', null, data.message || 'Give the correct serial');
      else serverError();
    } catch (e) {
      serverError(e.name === 'AbortError'
        ? 'The server took too long to respond. Do NOT assume this ticket was verified. Search it again to check its status.'
        : 'Cannot reach the server. Ticket was NOT verified. Check the internet connection and try again.');
    } finally { clearTimeout(timer); setBusy(false); }
  }

  /* ---------- Modal ---------- */
  function row(k, v) { return `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`; }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function openModal(kind, title, text, details, banner) {
    el.modal.className = 'modal glass s-' + kind;
    el.mIcon.innerHTML = ICON[kind === 'ok' ? 'ok' : kind === 'warn' ? 'warn' : 'err'];
    el.mTitle.textContent = title; el.mText.textContent = text;
    el.mDetails.innerHTML = details || ''; el.mBanner.textContent = banner || '';
    el.overlay.hidden = false; modalOpen = true;
    requestAnimationFrame(() => el.overlay.classList.add('show'));
    el.again.focus();
  }

  function base(t) { return row('Ticket Holder', t.name) + row('Serial Number', t.serialNo) + row('Phone Number', t.phone); }

  function showResult(kind, t, customMessage) {
    if (kind === 'ok') {
      openModal('ok', '✓ TICKET VERIFIED', 'Ticket is Verified!', base(t), 'Ticket Successfully Verified – First Entry');
    } else if (kind === 'warn') {
      openModal('warn', '⚠ THIS IS ALREADY VERIFIED ONCE!',
        'This ticket has already been used for entry. Please check before allowing entry again.',
        base(t) + row('First verified on', t.verifiedDate) + row('Time', t.verifiedTime) + row('Verified by', t.verifiedByName), 'ALREADY USED – DO NOT TREAT AS FRESH ENTRY');
    } else {
      openModal('err', '✕ INVALID TICKET', customMessage || 'Give the correct serial');
    }
  }

  function serverError(msg) {
    openModal('err', '✕ SERVER ERROR', msg || 'The server could not complete the check. Ticket was NOT verified. Try again in a moment.');
  }

  /* ---------- Modal & Reset Logic ---------- */
  function closeModal() {
    if (!modalOpen) return;
    modalOpen = false; 
    el.overlay.classList.remove('show');
    
    setTimeout(() => { 
      if (!modalOpen) el.overlay.hidden = true; 
    }, 230);

    el.serial.value = ''; 
    el.serial.readOnly = false;
    el.verifyBtn.disabled = false;
    busy = false;
    el.inlineError.hidden = true; 
    
    setTimeout(() => {
      el.serial.focus();
    }, 50);
  }

  if (el.again) {
    el.again.onclick = (e) => {
      e.preventDefault();
      closeModal();
    };
  }

  document.addEventListener('keydown', (e) => { 
    if (modalOpen && (e.key === 'Escape' || e.key === 'Enter')) { 
      e.preventDefault(); 
      closeModal(); 
    } 
  });

  /* ---------- Live statistics ---------- */
  const shown = {};
  function setNum(id, n) {
    const node = $(id);
    if (shown[id] === n) return;
    const had = shown[id] !== undefined; shown[id] = n;
    node.textContent = n.toLocaleString('en-US');
    if (had) { node.classList.remove('bump'); void node.offsetWidth; node.classList.add('bump'); }
  }
  function renderStats(s) { setNum('sTotal', s.total); setNum('sVerified', s.verified); setNum('sRemaining', s.remaining); }

  let es = null, poll = null;
  function startStats() {
    if (es || poll) return;
    const pull = () => fetch(API + '/stats', { cache: 'no-store' }).then((r) => r.json()).then(renderStats).catch(() => {});
    pull();
    if (window.EventSource) {
      es = new EventSource(API + '/stats/stream');
      es.addEventListener('stats', (e) => renderStats(JSON.parse(e.data)));
    }
    poll = setInterval(pull, 8000);
  }

  /* ---------- Connectivity banner ---------- */
  const net = () => { el.offline.hidden = navigator.onLine; };
  addEventListener('online', net); addEventListener('offline', net); net();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !modalOpen) el.serial.focus(); });

  /* ---------- Global Click & Focus Recovery (Bottom Section) ---------- */
  document.addEventListener('click', (e) => {
    if (!modalOpen && el.serial) {
      el.serial.readOnly = false;
      if (e.target !== el.verifyBtn && e.target !== el.again && e.target.tagName !== 'BUTTON') {
        el.serial.focus();
      }
    }
  });

  if (el.serial) {
    el.serial.addEventListener('click', (e) => {
      e.stopPropagation();
      el.serial.readOnly = false;
      el.serial.focus();
    });
  }

  /* ---------- Boot directly to verification ---------- */
  if (el.verifyScreen) el.verifyScreen.hidden = false;
  startStats();
  if (el.serial) el.serial.focus();
})();