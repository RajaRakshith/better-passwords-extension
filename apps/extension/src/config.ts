// Shared product identity. Browser packages and download routes use the same configuration.

export const DISPLAY_NAME = "Better Passwords";

export const REPO_URL = "https://github.com/fanckush/apple-passwords-plus";
export const SETUP_COMMAND = `curl -fsSL ${REPO_URL}/raw/main/scripts/setup-mac.sh | sh`;

/** Our own registration of Apple's helper, written by scripts/setup-mac.sh or the companion app. */
export const BRIDGE_HOST = "io.github.fanckush.betterpasswords.bridge";

/** The optional Touch ID companion app's own native host (see apps/companion). */
export const COMPANION_HOST = "io.github.fanckush.betterpasswords.companion";

export const HELPER_PATH =
  "/System/Cryptexes/App/System/Library/CoreServices/PasswordManagerBrowserExtensionHelper.app/Contents/MacOS/PasswordManagerBrowserExtensionHelper";

/**
 * Project-owned development key, giving Chromium builds the stable ID kmkmelgjmhnfhhbgagdaejamhodddfmh.
 * Replace with the Chrome Web Store's public key once the listing exists.
 */
export const EXTENSION_PUBLIC_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA9CWVpaas10FNP4dB6E7x/Ln9MYeR5HXFBC7WvXfEgJ397qj6wSDBFOMJAWqqhN6/xSO7OPUbbdW3Jm+RfaKofcREe6/9oq9U4e15IisZoi0aeYjB7kay2tRnTj1WNqAHaxFwetz4L1oWRxa3D7pBck5RfqcPdAf0JTD5uwoxaQJkfj+iJMXeR6fhIDYXNy3yCEZ7/5T0o4lKC2y4FbrcH5vzJVuETkhlxigDeRC/09F+gLWuUmu7/qs4SzzCLhC5kzleGClLpgqPZbXll9IE0M55JHVlXllk0TLn9Y/JYfBpkHLXHDrQfo5HFizKST5uuWfMwTtQ49hjdsvf0Dt9JQIDAQAB";

export const EXTENSION_ID = "kmkmelgjmhnfhhbgagdaejamhodddfmh";
export const FIREFOX_EXTENSION_ID = "better-passwords@fanckush.github.io";

/** Pages where the inline menu runs and passwords may be filled (see src/url-policy.ts). */
export const FILL_MATCHES = ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"];

/** The same optional companion app is used by every extension installation. */
export const COMPANION_DOWNLOAD_URL = `${REPO_URL}/releases`;
