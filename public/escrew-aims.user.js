// ==UserScript==
// @name         eScrew AIMS Connector
// @namespace    https://rbozzhanov-web.github.io/eScrew/
// @version      1.0.0
// @description  Automatically captures AIMS roster responses for eScrew without reading credentials or session data.
// @match        https://aims.airastana.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const AIMS_ORIGIN = 'https://aims.airastana.com';
  const TYPE = 'escrew:aims-scheduler-events';
  const STORAGE_KEY = 'escrew:aims-roster:v1';
  const BUTTON_ID = '__escrewAimsCopy';

  if (location.origin !== AIMS_ORIGIN) return;
  if (window.__escrewPersistentConnectorInstalled) return;
  window.__escrewPersistentConnectorInstalled = true;

  const isRoster = (value) => Boolean(
    value &&
    typeof value === 'object' &&
    typeof value.PeriodStart === 'string' &&
    typeof value.PeriodEnd === 'string' &&
    Array.isArray(value.SchedulerEvents)
  );

  const clean = (value) => ({
    PeriodStart: value.PeriodStart,
    PeriodEnd: value.PeriodEnd,
    RosterDateTime: value.RosterDateTime,
    SchedulerEvents: value.SchedulerEvents,
  });

  const readCaptured = () => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const envelope = JSON.parse(raw);
      return envelope && envelope.type === TYPE && isRoster(envelope.payload) ? envelope : null;
    } catch {
      return null;
    }
  };

  let captured = readCaptured();

  const copyEnvelope = async (button) => {
    if (!captured) return;
    const text = JSON.stringify(captured);
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'Copied — return to eScrew';
      button.style.background = '#007F86';
      alert('Roster copied. Return to eScrew and tap AIMS to import it.');
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        if (document.execCommand('copy')) {
          button.textContent = 'Copied — return to eScrew';
          button.style.background = '#007F86';
          alert('Roster copied. Return to eScrew and tap AIMS to import it.');
        } else {
          prompt('Copy this roster JSON, then return to eScrew and tap AIMS:', text);
        }
      } finally {
        area.remove();
      }
    }
  };

  const ensureButton = () => {
    if (window.top !== window) return null;
    if (!document.body) return null;
    let button = document.getElementById(BUTTON_ID);
    if (button) return button;

    button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    Object.assign(button.style, {
      position: 'fixed',
      left: '16px',
      right: '16px',
      bottom: 'calc(16px + env(safe-area-inset-bottom))',
      zIndex: '2147483647',
      minHeight: '52px',
      border: '0',
      borderRadius: '14px',
      padding: '12px 18px',
      background: captured ? '#007F86' : '#60777A',
      color: '#fff',
      font: '700 15px -apple-system,BlinkMacSystemFont,system-ui,sans-serif',
      boxShadow: '0 8px 24px rgba(0,0,0,.25)',
    });
    button.textContent = captured ? 'Copy roster to eScrew' : 'eScrew active — open My Schedule';
    button.addEventListener('click', () => {
      if (!captured) {
        alert('eScrew connector is active. Open My Schedule normally; the first roster response will be captured automatically.');
        return;
      }
      void copyEnvelope(button);
    });
    document.body.appendChild(button);
    return button;
  };

  const refreshButton = () => {
    const button = ensureButton();
    if (!button) return;
    button.textContent = captured ? 'Copy roster to eScrew' : 'eScrew active — open My Schedule';
    button.style.background = captured ? '#007F86' : '#60777A';
  };

  const deliver = (value) => {
    if (!isRoster(value)) return false;
    captured = { type: TYPE, payload: clean(value) };
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(captured));
    } catch {}
    refreshButton();
    return true;
  };

  const inspectText = (text) => {
    try {
      return deliver(JSON.parse(text));
    } catch {
      return false;
    }
  };

  if (!window.__escrewFetchPatched && window.fetch) {
    window.__escrewFetchPatched = true;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await nativeFetch(...args);
      try {
        response.clone().text().then(inspectText).catch(() => {});
      } catch {}
      return response;
    };
  }

  if (!window.__escrewXhrPatched && window.XMLHttpRequest) {
    window.__escrewXhrPatched = true;
    const nativeSend = window.XMLHttpRequest.prototype.send;
    window.XMLHttpRequest.prototype.send = function (...args) {
      this.addEventListener('load', () => {
        try {
          inspectText(this.responseText);
        } catch {}
      });
      return nativeSend.apply(this, args);
    };
  }

  const mount = () => {
    refreshButton();
    if (window.top === window) {
      const observer = new MutationObserver(() => refreshButton());
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
