/* Build stamp. This is the single place to bump the version: the service
   worker builds its cache name from it and the Pip-Boy DATA screen shows it,
   so the two can never disagree. Bump it whenever the game changes. */
self.WA_VERSION = "0.75.0";

if (typeof window !== "undefined") {
  window.WA = window.WA || {};
  window.WA.VERSION = self.WA_VERSION;
}
