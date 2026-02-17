export function normalizePakistaniPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;

  const digits = phone.trim().replace(/[^\d]/g, "");

  let core = digits;
  if (core.startsWith("0092")) {
    core = core.slice(4);
  } else if (core.startsWith("92") && core.length >= 12) {
    core = core.slice(2);
  } else if (core.startsWith("0")) {
    core = core.slice(1);
  }

  if (core.length === 10 && core.startsWith("3")) {
    return "0" + core;
  }

  return phone.trim();
}
