export function whatsappUrl(phone: string, message: string) {
  if (!/^\+?[\d\s().-]+$/.test(phone.trim())) throw new Error("Ingrese el teléfono con código de país.");
  const digits = phone.replace(/\D/g, "");
  if (!/^[1-9]\d{7,14}$/.test(digits)) throw new Error("Ingrese el teléfono con código de país, por ejemplo +56 9 1234 5678.");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function mailtoUrl(email: string, subject: string, body: string) {
  if (!/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(email)) throw new Error("Ingrese un correo válido.");
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
