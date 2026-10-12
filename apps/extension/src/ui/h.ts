// A tiny element factory, so UI code stays declarative without a framework.

type Child = Node | string | false | null | undefined;
type Props<K extends keyof HTMLElementTagNameMap> = Partial<Omit<HTMLElementTagNameMap[K], "style">> & {
  class?: string;
  dataset?: Record<string, string>;
  attrs?: Record<string, string>;
};

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props<K> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { class: className, dataset, attrs, ...rest } = props;
  if (className) el.className = className;
  Object.assign(el, rest);
  for (const [key, value] of Object.entries(dataset ?? {})) el.dataset[key] = value;
  for (const [key, value] of Object.entries(attrs ?? {})) el.setAttribute(key, value);
  for (const child of children) if (child !== false && child != null) el.append(child);
  return el;
}
