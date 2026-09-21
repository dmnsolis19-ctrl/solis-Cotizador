export function normalizeChileRut(value: string) {
  const compact = value.replace(/[^0-9kK]/g, "").toUpperCase();
  if (!compact) return "";
  if (compact.length < 2) return compact;
  const body = compact.slice(0, -1).replace(/^0+/, "") || "0";
  const verifier = compact.slice(-1);
  const grouped = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${grouped}-${verifier}`;
}

export function isValidChileRut(value: string) {
  const compact = value.replace(/[^0-9kK]/g, "").toUpperCase();
  if (!compact) return true;
  if (!/^\d{2,8}[0-9K]$/.test(compact)) return false;

  const body = compact.slice(0, -1);
  const suppliedVerifier = compact.slice(-1);
  let sum = 0;
  let multiplier = 2;

  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const result = 11 - (sum % 11);
  const expectedVerifier = result === 11 ? "0" : result === 10 ? "K" : String(result);
  return suppliedVerifier === expectedVerifier;
}
