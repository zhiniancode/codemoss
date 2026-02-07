import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import { preloadClientStores } from "./services/clientStorage";
import { migrateLocalStorageToFileStore } from "./services/migrateLocalStorage";

const sentryDsn =
  import.meta.env.VITE_SENTRY_DSN ??
  "https://8ab67175daed999e8c432a93d8f98e49@o4510750015094784.ingest.us.sentry.io/4510750016012288";

Sentry.init({
  dsn: sentryDsn,
  enabled: Boolean(sentryDsn),
  release: __APP_VERSION__,
});

Sentry.metrics.count("app_open", 1, {
  attributes: {
    env: import.meta.env.MODE,
    platform: "macos",
  },
});

async function bootstrap() {
  await preloadClientStores();
  migrateLocalStorageToFileStore();
  // i18n must be imported after preload so language can be read from cache
  await import("./i18n");
  const { default: App } = await import("./App");
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap();
