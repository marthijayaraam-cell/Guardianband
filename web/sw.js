// GuardianBand PWA Service Worker
// Keeps background push notifications active on Mobile (Android & iOS) and Desktop even when Chrome is closed!

self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker Installing for GuardianBand Mobile PWA...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker Activated and claiming clients...');
  event.waitUntil(self.clients.claim());
});

// Background Push Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Pinned background notification clicked. Opening/Focusing GuardianBand app...');
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
          }
        }
        return client.focus();
      }
      return clients.openWindow('/index.html');
    })
  );
});

// Background Push Message Listener
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { 
    title: "🚨 GUARDIANBAND FALL ALERT!", 
    body: "Fall impact confirmed! Check patient immediately." 
  };
  
  const options = {
    body: data.body + "\n[TAP TO OPEN DASHBOARD & SILENCE ALARM]",
    icon: 'https://cdn-icons-png.flaticon.com/512/564/564619.png',
    badge: 'https://cdn-icons-png.flaticon.com/512/564/564619.png',
    vibrate: [1000, 500, 1000, 500, 1000, 500, 1000],
    requireInteraction: true, // Forces pinned alert on Android/iOS lock screens!
    tag: 'guardianband-mobile-alert'
  };
  
  event.waitUntil(self.registration.showNotification(data.title, options));
});
