/** Read a param from search (?k=) or hash (#k=), search wins. null if absent. */
export const readUrlParam = (key: string): string | null => {
  if (typeof window === "undefined") return null;
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return search.get(key) ?? hash.get(key);
};
