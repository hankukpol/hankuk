const DEFAULT_URL = "/student/notices";
const DEFAULT_TITLE = "\uC544\uCE68\uBAA8\uC758\uACE0\uC0AC \uACF5\uC9C0";
const DEFAULT_BODY = "\uC0C8 \uACF5\uC9C0\uC0AC\uD56D\uC774 \uAC8C\uC2DC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.";

function readPushData(event) {
  if (!event.data) {
    return {};
  }

  try {
    return event.data.json() || {};
  } catch {
    try {
      return { body: event.data.text() };
    } catch {
      return {};
    }
  }
}

function resolveTargetUrl(value) {
  if (typeof value !== "string" || !value.startsWith("/student")) {
    return DEFAULT_URL;
  }

  return value;
}

function isStudentClient(client) {
  if (!client || typeof client.url !== "string") {
    return false;
  }

  try {
    const url = new URL(client.url);
    return url.origin === self.location.origin && url.pathname.startsWith("/student");
  } catch {
    return false;
  }
}

self.addEventListener("push", (event) => {
  const data = readPushData(event);
  const title = typeof data.title === "string" && data.title.trim()
    ? data.title.trim()
    : DEFAULT_TITLE;
  const body = typeof data.body === "string" && data.body.trim()
    ? data.body.trim()
    : DEFAULT_BODY;
  const url = resolveTargetUrl(data.url);

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  const data = event.notification && event.notification.data ? event.notification.data : {};
  const url = resolveTargetUrl(data.url);
  event.notification.close();

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });

    const studentClient = clients.find(isStudentClient);

    if (studentClient) {
      let navigated = true;
      if (typeof studentClient.navigate === "function") {
        navigated = Boolean(await studentClient.navigate(url).catch(() => null));
      }

      if (navigated && typeof studentClient.focus === "function") {
        await studentClient.focus();
        return;
      }
    }

    await self.clients.openWindow(url);
  })());
});