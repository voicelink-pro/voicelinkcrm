const cacheName = "voicelink-stage13"

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(cacheName)
      .then((cache) => cache.addAll(["/offline", "/icons/icon-192.png", "/icons/icon-512.png"]))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== cacheName).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || event.request.mode !== "navigate") {
    return
  }

  event.respondWith(fetch(event.request).catch(() => caches.match("/offline")))
})

function parsePushPayload(event) {
  if (!event.data) {
    return {}
  }
  try {
    return event.data.json()
  } catch {
    return { title: "VoiceLink", body: event.data.text() }
  }
}

self.addEventListener("push", (event) => {
  const data = parsePushPayload(event)
  const title = typeof data.title === "string" && data.title.trim() ? data.title.slice(0, 80) : "VoiceLink"
  const body = typeof data.body === "string" ? data.body.slice(0, 140) : ""
  const url = internalPath(data.url)
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url },
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = internalPath(event.notification.data && event.notification.data.url)
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const windowClient of windows) {
        if (windowClient.url.startsWith(self.location.origin) && "focus" in windowClient) {
          return windowClient
            .focus()
            .then((focused) => {
              const client = focused || windowClient
              if (client && "navigate" in client) {
                return client.navigate(url)
              }
              return self.clients.openWindow(url)
            })
            .catch(() => self.clients.openWindow(url))
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})

function internalPath(value) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("://")
  ) {
    return "/notifications"
  }
  return value
}
