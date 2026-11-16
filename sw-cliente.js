// Service worker do CLIENTE (C5, D-041): só recebe o push dos lembretes e abre a página do horário.
// Não faz cache nem intercepta requisições, e fica num escopo separado (./cliente-push/), para não
// competir com o service worker do app interno nem baixar o app no celular do cliente.
// Todo push mostra uma notificação (exigência do navegador, userVisibleOnly).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (_) { d = {}; }
  const titulo = String(d.titulo || 'Lembrete do seu horário').slice(0, 100);
  event.waitUntil(self.registration.showNotification(titulo, {
    body: String(d.corpo || '').slice(0, 200),
    tag: String(d.tag || 'lembrete').slice(0, 40),
    icon: 'icon.svg',
    badge: 'icon.svg'
  }));
});

// O destino é fixo (a página do horário): o texto do push nunca escolhe para onde abrir.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
    for (const c of lista) if (c.url.includes('meu-horario.html') && 'focus' in c) return c.focus();
    return self.clients.openWindow('./meu-horario.html');
  }));
});
