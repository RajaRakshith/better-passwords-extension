// Hide My Email through icloud.com's web service, using the browser's icloud.com sign-in.
// Background worker only: the menu and pages never talk to iCloud.
//
// The service is undocumented; the calls follow what icloud.com itself makes, as worked out by
// dedoussis/icloud-hide-my-email-browser-extension (MIT, see NOTICE). It accepts requests only
// with icloud.com's Origin, so while Hide My Email is on, a session rule sets Origin and Referer
// on our background's own requests to iCloud (see headerRule).

const SETUP_URL = "https://setup.icloud.com/setup/ws/1";
const ICLOUD_WEB = "https://www.icloud.com";
const NOTE = "Created by Apple Passwords Plus";

export class ICloudError extends Error {
  constructor(
    message: string,
    /** "signed-out": not signed in to icloud.com in this browser; "failed": anything else. */
    readonly code: "signed-out" | "failed",
  ) {
    super(message);
  }
}

export interface HmeAddress {
  hme: string;
  label: string;
  isActive: boolean;
}

interface ServiceReply<T> {
  success?: boolean;
  result?: T;
  error?: { errorMessage?: string };
}

const RULE_ID = 1;

/**
 * Sets icloud.com's Origin and Referer on requests to iCloud that aren't made from a tab: only our
 * own background's, since a session rule never applies to other extensions' requests. Pages'
 * requests to iCloud are left alone.
 */
export const headerRule = {
  id: RULE_ID,
  priority: 1,
  action: {
    type: "modifyHeaders" as const,
    requestHeaders: [
      { header: "Origin", operation: "set" as const, value: ICLOUD_WEB },
      { header: "Referer", operation: "set" as const, value: `${ICLOUD_WEB}/` },
    ],
  },
  condition: {
    requestDomains: ["icloud.com"],
    tabIds: [-1],
    resourceTypes: ["xmlhttprequest" as const],
  },
};

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export class HideMyEmail {
  #service: { url: string; at: number } | undefined;

  constructor(
    private readonly fetchImpl: Fetch = (input, init) => fetch(input, init),
    private readonly now: () => number = Date.now,
  ) {}

  /** Forgets the iCloud session (on sign-out, or when turned off). */
  reset(): void {
    this.#service = undefined;
  }

  /** The Hide My Email service for the signed-in account. Cached for five minutes. */
  async #serviceUrl(): Promise<string> {
    if (this.#service && this.now() - this.#service.at < 5 * 60_000) return this.#service.url;
    const response = await this.fetchImpl(`${SETUP_URL}/validate`, { method: "POST", credentials: "include" });
    const body = (await response.json().catch(() => undefined)) as
      | { webservices?: { premiummailsettings?: { url?: string } } }
      | undefined;
    const url = body?.webservices?.premiummailsettings?.url;
    if (!response.ok || !url) {
      throw new ICloudError("Sign in to iCloud in this browser to use Hide My Email.", "signed-out");
    }
    this.#service = { url, at: this.now() };
    return url;
  }

  async #call<T>(method: "GET" | "POST", path: string, data?: Record<string, unknown>): Promise<T> {
    const base = await this.#serviceUrl();
    const response = await this.fetchImpl(`${base}${path}`, {
      method,
      credentials: "include",
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    if (response.status === 401 || response.status === 421) {
      this.reset();
      throw new ICloudError("Sign in to iCloud in this browser to use Hide My Email.", "signed-out");
    }
    const reply = (await response.json().catch(() => undefined)) as ServiceReply<T> | undefined;
    if (!response.ok || !reply?.success || reply.result === undefined) {
      throw new ICloudError(reply?.error?.errorMessage || "iCloud couldn't do that. Try again.", "failed");
    }
    return reply.result;
  }

  /** The active address made for this site before, if any (matched by its label). */
  async addressFor(hostname: string): Promise<string | undefined> {
    const { hmeEmails = [] } = await this.#call<{ hmeEmails?: HmeAddress[] }>("GET", "/v2/hme/list");
    return hmeEmails.find((address) => address.isActive && address.label === hostname)?.hme;
  }

  /** A fresh random address, not yet reserved. */
  async generate(): Promise<string> {
    return (await this.#call<{ hme: string }>("POST", "/v1/hme/generate")).hme;
  }

  /** Reserves a generated address for this site; from then on it forwards to the user's inbox. */
  async reserve(address: string, hostname: string): Promise<string> {
    const result = await this.#call<{ hme: { hme: string } }>("POST", "/v1/hme/reserve", {
      hme: address,
      label: hostname,
      note: NOTE,
    });
    return result.hme.hme;
  }
}
