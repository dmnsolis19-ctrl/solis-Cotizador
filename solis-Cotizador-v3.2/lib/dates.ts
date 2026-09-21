export const BUSINESS_TIME_ZONE = "America/Santiago";

export function businessDate(date = new Date(), timeZone = BUSINESS_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function businessYear(date = new Date(), timeZone = BUSINESS_TIME_ZONE) {
  return Number(businessDate(date, timeZone).slice(0, 4));
}
