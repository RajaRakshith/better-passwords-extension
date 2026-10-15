// Sends iCloud a cross-site request with the user's cookies, as a forged request would.
self.addEventListener("message", (event) => {
  event.waitUntil(fetch(event.data, { method: "POST", mode: "no-cors", credentials: "include", body: "{}" }));
});
