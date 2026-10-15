// Identity and build-variant settings. The display name lives here so branding is one edit.

export const DISPLAY_NAME = "Apple Passwords Plus";

export const REPO_URL = "https://github.com/fanckush/apple-passwords-plus";
export const SETUP_COMMAND = `curl -fsSL ${REPO_URL}/raw/main/scripts/setup-mac.sh | sh`;

export type Variant = "store" | "github";

/** Native host Apple installs for its own extension (allowed only for Apple's extension IDs). */
export const APPLE_HOST = "com.apple.passwordmanager";

/** Our own registration of Apple's helper, written by scripts/setup-mac.sh or the companion app. */
export const STORE_HOST = "org.applepasswordsplus.bridge";

/** The optional Touch ID companion app's own native host (see apps/companion). */
export const COMPANION_HOST = "org.applepasswordsplus.companion";

export const HELPER_PATH =
  "/System/Cryptexes/App/System/Library/CoreServices/PasswordManagerBrowserExtensionHelper.app/Contents/MacOS/PasswordManagerBrowserExtensionHelper";

/**
 * Public key of Apple's own iCloud Passwords Chrome extension. The github build ships it so
 * Chrome assigns Apple's ID (pejdijmoenmkgeppbflobdenhhabjlaj), which Apple's preinstalled
 * host registration already allows. Such a build can only be loaded unpacked.
 */
export const APPLE_PUBLIC_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAk4xPYZla5XqlDN0PPiLCQAYRqdaR06jSl3sntEE5jHoe7XldFqhsdBSp4L8mozwjCwi6z5YtEpTV1L2k4WYmDuiwoH7YKGlQD/YbC8QMcPvGLWOr8WYfXWtECKv0Nx7Tahk8nCIDWgJVm8YmPIDhPv4o5VVrq6aUveCKvTOskHWFyRzSTC2VKpzIVX7F65UzqqOmqLfMpo6lfaLcKSC7G6oQLA/wS7hcGZEwZ11si6XWR4o/hDuUSt6zdacy/sc7H80eH3lMnEmvb6HoB7+KvxfGIU7dqRmhA/w/X0qkiIJYeoo4tZrNxBj7TTLz9hnHUbMRwJqsoIU+pkoprgFWDQIDAQAB";

/**
 * Development key for the store build, giving it the stable ID kmkmelgjmhnfhhbgagdaejamhodddfmh.
 * Replace with the Chrome Web Store's public key once the listing exists.
 */
export const STORE_PUBLIC_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA9CWVpaas10FNP4dB6E7x/Ln9MYeR5HXFBC7WvXfEgJ397qj6wSDBFOMJAWqqhN6/xSO7OPUbbdW3Jm+RfaKofcREe6/9oq9U4e15IisZoi0aeYjB7kay2tRnTj1WNqAHaxFwetz4L1oWRxa3D7pBck5RfqcPdAf0JTD5uwoxaQJkfj+iJMXeR6fhIDYXNy3yCEZ7/5T0o4lKC2y4FbrcH5vzJVuETkhlxigDeRC/09F+gLWuUmu7/qs4SzzCLhC5kzleGClLpgqPZbXll9IE0M55JHVlXllk0TLn9Y/JYfBpkHLXHDrQfo5HFizKST5uuWfMwTtQ49hjdsvf0Dt9JQIDAQAB";

export const STORE_EXTENSION_ID = "kmkmelgjmhnfhhbgagdaejamhodddfmh";
export const APPLE_EXTENSION_ID = "pejdijmoenmkgeppbflobdenhhabjlaj";
export const FIREFOX_EXTENSION_ID = "apple-passwords-plus@applepasswordsplus.org";

/** Pages where the inline menu runs and passwords may be filled (see src/url-policy.ts). */
export const FILL_MATCHES = ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"];

/**
 * Where to get the Mac app (Touch ID, your emails). The store build will link to its App Store
 * listing and the GitHub build to the landing page's DMG; until those exist, both open its docs.
 */
export function macAppUrlFor(_variant: Variant): string {
  return `${REPO_URL}/blob/main/docs/companion.md`;
}

export function nativeHostFor(variant: Variant): string {
  return variant === "github" ? APPLE_HOST : STORE_HOST;
}
