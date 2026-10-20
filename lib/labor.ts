import { z } from "zod";
export type LaborReference = { code: string; name: string; category: string; unit: string; publicPrice: number; maximumPrice?: number; includesVat: boolean | null; scope: string; source: string; sourceUrl: string; checkedAt: string; region: string; kind: "labor" | "service_with_materials" };
const common = { checkedAt: "2026-10-20", region: "Región Metropolitana", unit: "un", includesVat: false, source: "RD Electric", kind: "labor" } as const;
export const LABOR_REFERENCES: LaborReference[] = [
  { ...common, code: "MO-CL-001", name: "Instalación de enchufe o interruptor", category: "Electricidad", unit: "punto", publicPrice: 28560, includesVat: true, scope: "Conexión y prueba de un punto. Las piezas de recambio las paga el cliente; un técnico.", source: "Handi", sourceUrl: "https://handi.cl/product/instalacion-de-enchufe-interruptor/" },
  { ...common, code: "MO-CL-002", name: "Punto de enchufe o interruptor (rango publicado)", category: "Electricidad", unit: "punto", publicPrice: 20000, maximumPrice: 90000, includesVat: true, scope: "Mano de obra por punto; materiales aparte. Visita se cobra y puede abonarse al trabajo.", source: "SecEléctrico", sourceUrl: "https://secelectrico.cl/instalacion-enchufes/" },
  { ...common, code: "MO-CL-003", name: "Visita técnica eléctrica", category: "Electricidad", publicPrice: 49990, scope: "Inspección, mediciones básicas y diagnóstico. El proveedor descuenta la visita si contrata la reparación.", sourceUrl: "https://rdelectric.cl/p/visita-tecnica/" },
  { ...common, code: "MO-CL-004", name: "Mantenimiento de tablero eléctrico", category: "Electricidad", publicPrice: 139990, scope: "Revisión, mediciones y pruebas del tablero. Repuestos excluidos; confirmar tamaño y condiciones.", sourceUrl: "https://rdelectric.cl/p/mantenimiento-de-tableros-electricos/" },
  { ...common, code: "MO-CL-005", name: "Reparación básica de cortocircuito", category: "Electricidad", publicPrice: 89990, scope: "Diagnóstico y reparación básica; repuestos aparte. Confirmar dificultad antes de contratar.", sourceUrl: "https://rdelectric.cl/p/reparacion-basica-de-cortocircuito/" },
  { ...common, code: "MO-CL-006", name: "Instalación de aire acondicionado split", category: "Climatización", publicPrice: 149990, kind: "service_with_materials", scope: "Montaje, conexión y pruebas; incluye soporte de muro o piso. Otros repuestos excluidos; equipo aparte.", sourceUrl: "https://rdelectric.cl/p/instalacion-de-aires-acondicionados/" },
  ...[{ code: "MO-CL-007", btu: "9.000–12.000", price: 125000 }, { code: "MO-CL-008", btu: "18.000–24.000", price: 140000 }, { code: "MO-CL-009", btu: "36.000 o más", price: 160000 }].map(r => ({ ...common, code: r.code, name: `Instalación split ${r.btu} BTU (desde)`, category: "Climatización", publicPrice: r.price, includesVat: null, kind: "service_with_materials" as const, scope: "Incluye kit de tuberías de hasta 3 m, montaje, vacío y arranque. Equipo excluido; IVA por confirmar.", source: "Climatizaexpertos", sourceUrl: "https://climatizaexpertos.com/climatizaexpertos-com-instalacion/" })),
];
export const crewSchema = z.object({ role: z.string().trim().min(2).max(80), people: z.number().int().min(1).max(100), hours: z.number().finite().positive().max(10000), costRate: z.number().finite().min(0).max(1e8), saleRate: z.number().finite().min(0).max(1e8) });
export const laborEstimateSchema = z.object({
  name: z.string().trim().min(2).max(200), specialty: z.enum(["PLC / HMI", "Ingeniería", "Puesta en marcha", "Fotovoltaica", "Climatización", "Electricidad"]),
  currency: z.enum(["CLP", "USD", "EUR", "UF"]), scope: z.string().trim().min(5).max(1000), crew: z.array(crewSchema).min(1).max(20),
  travelHours: z.number().finite().min(0).max(10000), travelCostRate: z.number().finite().min(0).max(1e8), travelSaleRate: z.number().finite().min(0).max(1e8),
  transportCost: z.number().finite().min(0).max(1e9), transportSale: z.number().finite().min(0).max(1e9),
  perDiemDays: z.number().finite().min(0).max(1000), perDiemCost: z.number().finite().min(0).max(1e8), perDiemSale: z.number().finite().min(0).max(1e8),
});
export type LaborEstimate = z.infer<typeof laborEstimateSchema>;
export function laborEstimateTotals(value: LaborEstimate) {
  const input = laborEstimateSchema.parse(value); const people = input.crew.reduce((s, c) => s + c.people, 0);
  const hours = input.crew.reduce((s, c) => s + c.people * c.hours, 0);
  const cost = input.crew.reduce((s, c) => s + c.people * c.hours * c.costRate, 0) + people * input.travelHours * input.travelCostRate + input.transportCost + people * input.perDiemDays * input.perDiemCost;
  const sale = input.crew.reduce((s, c) => s + c.people * c.hours * c.saleRate, 0) + people * input.travelHours * input.travelSaleRate + input.transportSale + people * input.perDiemDays * input.perDiemSale;
  if (Math.max(cost, sale) > 1e12) throw new Error("La estimación supera el límite monetario.");
  return { people, hours, cost: Math.round(cost * 100) / 100, sale: Math.round(sale * 100) / 100 };
}
