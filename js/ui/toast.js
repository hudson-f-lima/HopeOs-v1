import { escapeHtml } from '../utils.js';

const TOAST_LIMIT = 3;
let toastQueue = [];
let activeToasts = [];

export function showToast({ type = 'info', title, message, duration = 4000, action }) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const id = 'toast-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);

  const toastObj = { id, type, title, message, duration, action };
  
  if (activeToasts.length >= TOAST_LIMIT) {
    toastQueue.push(toastObj);
    return;
  }
  
  renderToast(toastObj, container);
}

function renderToast(toastObj, container) {
  activeToasts.push(toastObj);
  
  const toastEl = document.createElement('div');
  toastEl.className = `toast toast-${toastObj.type}`;
  toastEl.id = toastObj.id;
  
  let icon = '';
  if (toastObj.type === 'success') icon = '✅';
  else if (toastObj.type === 'error') icon = '❌';
  else if (toastObj.type === 'warning') icon = '⚠️';
  else icon = 'ℹ️';

  let html = `<div class="toast-icon">${icon}</div>
              <div class="toast-content">`;
              
  if (toastObj.title) {
    html += `<div class="toast-title">${escapeHtml(toastObj.title)}</div>`;
  }
  
  html += `<div class="toast-message">${escapeHtml(toastObj.message)}</div>`;
  
  if (toastObj.action) {
    html += `<button class="toast-action-btn">${escapeHtml(toastObj.action.label)}</button>`;
  }
  
  html += `</div><button class="toast-close" aria-label="Fechar toast">×</button>`;
  
  toastEl.innerHTML = html;
  container.appendChild(toastEl);
  
  // Animate in
  requestAnimationFrame(() => {
    toastEl.classList.add('toast-visible');
  });

  const removeToast = () => {
    toastEl.classList.remove('toast-visible');
    toastEl.addEventListener('transitionend', () => {
      if (toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
      activeToasts = activeToasts.filter(t => t.id !== toastObj.id);
      if (toastQueue.length > 0) {
        const nextToast = toastQueue.shift();
        renderToast(nextToast, container);
      }
    });
  };

  const closeBtn = toastEl.querySelector('.toast-close');
  if (closeBtn) closeBtn.addEventListener('click', removeToast);

  if (toastObj.action && toastObj.action.onClick) {
    const actionBtn = toastEl.querySelector('.toast-action-btn');
    if (actionBtn) {
      actionBtn.addEventListener('click', () => {
        toastObj.action.onClick();
        removeToast();
      });
    }
  }

  if (toastObj.duration > 0) {
    setTimeout(() => {
      if (activeToasts.find(t => t.id === toastObj.id)) {
        removeToast();
      }
    }, toastObj.duration);
  }
}
