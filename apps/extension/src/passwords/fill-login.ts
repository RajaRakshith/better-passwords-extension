import { ProtocolError } from "@app/protocol";
import type { Session } from "../session/session.ts";
import { fillableUrl } from "../url-policy.ts";

export interface FillLoginDeps {
  session: Session;
  tabUrl(tabId: number): Promise<URL | undefined>;
  rememberChoice(hostname: string, username: string, tabId: number): void;
  forgetChoice(hostname: string): void;
}

/** The selection's origin comes from the displayed login list, never a later navigation. */
export async function fillLogin(
  deps: FillLoginDeps,
  selection: { tabId: number; username: string; expectedOrigin: string },
  fill: (origin: string, password: string | null) => Promise<string>,
): Promise<string> {
  const { tabId, username, expectedOrigin } = selection;
  const expected = fillableUrl(expectedOrigin);
  if (!expected || expected.origin !== expectedOrigin) return "origin-mismatch";
  const sameOrigin = async () => (await deps.tabUrl(tabId))?.origin === expectedOrigin;
  if (!(await sameOrigin())) return "origin-mismatch";
  await deps.session.unlockedClient();
  const epoch = deps.session.epoch;
  const current = () => {
    if (!deps.session.isCurrent(epoch)) throw new ProtocolError("The password session ended. Unlock again.", "closed");
  };
  if (!(await sameOrigin())) return "origin-mismatch";
  current();
  const probe = await fill(expectedOrigin, null);
  current();
  if (!(await sameOrigin())) return "origin-mismatch";
  current();
  if (probe === "filled") deps.rememberChoice(expected.hostname, username, tabId);
  if (probe !== "needs-password") return probe;
  const client = await deps.session.unlockedClient();
  current();
  const credential = await client.getPassword(expected.hostname, username, { tabId });
  current();
  if (!credential) throw new Error("That login is no longer saved.");
  if (!(await sameOrigin())) return "origin-mismatch";
  current();
  const result = await fill(expectedOrigin, credential.password);
  if (result === "filled" && deps.session.isCurrent(epoch)) deps.forgetChoice(expected.hostname);
  return result;
}
