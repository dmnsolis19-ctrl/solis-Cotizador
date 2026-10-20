import { env } from "cloudflare:workers";

type EmailMessage = { from: string; to: string; subject: string; text: string; attachments: Array<{ filename: string; content: ArrayBuffer; type: string; disposition: "attachment" }> };
type EmailEnv = { EMAIL?: { send(message: EmailMessage): Promise<{ messageId: string }> }; EMAIL_FROM?: string; RESEND_API_KEY?: string };
const config = () => env as unknown as EmailEnv;
export function emailConfigured() { const settings = config(); return Boolean(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.EMAIL_FROM || "") && (settings.EMAIL || settings.RESEND_API_KEY)); }
function base64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer); let value = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) value += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(value);
}
export async function sendApplicationEmail(message: Omit<EmailMessage, "from">, idempotencyKey: string) {
  const settings = config();
  if (!emailConfigured()) throw new Error("Configure EMAIL_FROM y un servicio de envío en Cloudflare.");
  if (settings.EMAIL) return await settings.EMAIL.send({ ...message, from: settings.EMAIL_FROM! });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", signal: AbortSignal.timeout(20000),
    headers: { "Authorization": `Bearer ${settings.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ from: settings.EMAIL_FROM, to: [message.to], subject: message.subject, text: message.text,
      attachments: message.attachments.map((file) => ({ filename: file.filename, content: base64(file.content), content_type: file.type })) }),
  });
  const result = await response.json() as { id?: string };
  if (!response.ok || !result.id) throw new Error("No se pudo confirmar el envío con el servicio de correo.");
  return { messageId: result.id };
}
