/* Service worker dos alertas da farm.
 *
 * Só faz duas coisas: mostra a notificação que o servidor mandou e, no toque, abre o
 * sistema na tela certa. Não guarda cache nem intercepta requisições — o sistema
 * continua funcionando exatamente como sem ele.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let dados = {};
  try { dados = e.data ? e.data.json() : {}; } catch (err) { dados = { titulo: 'PrintTech', corpo: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(dados.titulo || 'PrintTech', {
    body: dados.corpo || '',
    // A mesma impressora substitui o aviso anterior em vez de empilhar — mas avisa de novo.
    tag: dados.tag,
    renotify: !!dados.tag,
    icon: '/icone-192.png',
    data: { url: dados.url || '/impressoras' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/impressoras';
  e.waitUntil((async () => {
    // Se o sistema já está aberto numa aba, usa ela; senão abre uma nova.
    const abas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const aberta = abas.find((c) => new URL(c.url).origin === self.location.origin);
    if (aberta) {
      await aberta.focus();
      if ('navigate' in aberta) return aberta.navigate(url);
      return undefined;
    }
    return self.clients.openWindow(url);
  })());
});
