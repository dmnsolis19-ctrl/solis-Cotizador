import { z } from "zod";

const shortText = z.string().trim().max(240).default("");
export const companySettingsSchema = z.object({
  commercial_name: z.string().trim().min(2).max(120),
  tax_id: z.string().trim().max(20).default(""),
  tagline: shortText,
  business_activity: shortText,
  address: z.string().trim().max(300).default(""),
  representative: z.string().trim().max(120).default(""),
  phone: z.string().trim().max(60).default(""),
  email: z.union([z.literal(""), z.string().email().max(254)]).default(""),
  accountant_email: z.union([z.literal(""), z.string().email().max(254)]).default(""),
  logo_jpeg: z.string().max(350000).refine((value) => !value || /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value), "Use un logo JPEG válido.").default(""),
});
export type CompanySettings = z.infer<typeof companySettingsSchema>;

export function companyFormValues(company: Record<string, unknown>): CompanySettings {
  const str = (...keys: string[]) => String(keys.map((key) => company[key]).find(Boolean) || "");
  return {
    commercial_name: str("commercial_name", "name") || "SOLIS Ingeniería y Servicios SpA",
    tax_id: str("tax_id", "rut"), tagline: str("tagline") || "Automatización · Control · Integración Industrial",
    business_activity: str("business_activity", "giro"), address: str("address", "company_address"),
    representative: str("representative", "contact_name"), phone: str("phone", "company_phone"),
    email: str("email", "company_email"), accountant_email: str("accountant_email"), logo_jpeg: str("logo_jpeg"),
  };
}
