/** Format an ISO timestamp via the user's locale. "" if the string isn't a valid date. */
export const formatTime = (iso: string, style: "datetime" | "time" = "datetime"): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return style === "time" ? d.toLocaleTimeString() : d.toLocaleString();
};
