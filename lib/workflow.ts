export type WorkflowQuote = { locked: boolean; status: string; revision: number; number: string };

export const canFreeze = (quote: WorkflowQuote) => !quote.locked;
export const canCreateRevision = (quote: WorkflowQuote) => quote.locked;
export const canApprove = (quote: WorkflowQuote) => quote.locked && quote.status !== "Aprobada";
export const canCreateWorkOrder = (quote: WorkflowQuote) => quote.locked && quote.status === "Aprobada";

export function revisionNumber(currentNumber: string, nextRevision: number) {
  const base = currentNumber.replace(/-R\d+$/i, "");
  return `${base}-R${String(nextRevision).padStart(2, "0")}`;
}
