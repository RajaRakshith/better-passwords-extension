import { defineConfig } from "wxt";
import { APPLE_PUBLIC_KEY, DISPLAY_NAME, FIREFOX_EXTENSION_ID, STORE_PUBLIC_KEY, type Variant } from "./src/config.ts";

const variant: Variant = process.env.VARIANT === "github" ? "github" : "store";

export default defineConfig({
  outDirTemplate: `${variant}-{{browser}}-mv{{manifestVersion}}{{modeSuffix}}`,
  zip: { artifactTemplate: `{{name}}-{{packageVersion}}-${variant}-{{browser}}.zip` },
  vite: () => ({ define: { __VARIANT__: JSON.stringify(variant) } }),
  manifest: ({ browser }) => {
    if (variant === "github" && browser === "firefox") {
      throw new Error("The github build borrows Apple's Chrome extension ID and is Chromium-only.");
    }
    return {
      name: variant === "github" ? `${DISPLAY_NAME} (GitHub build)` : DISPLAY_NAME,
      description: "Fill passwords from Apple Passwords, pairing far less often.",
      permissions: ["nativeMessaging", "storage", "alarms", "idle", "activeTab", "scripting"],
      action: { default_title: DISPLAY_NAME },
      ...(browser === "firefox"
        ? { browser_specific_settings: { gecko: { id: FIREFOX_EXTENSION_ID, strict_min_version: "128.0" } } }
        : { key: variant === "github" ? APPLE_PUBLIC_KEY : STORE_PUBLIC_KEY }),
    };
  },
});
