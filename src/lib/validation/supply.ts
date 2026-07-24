import { z } from "zod";

export const supplyInputSchema = z.object({
  name: z.string().trim().min(1, "Requerido"),
  unit: z.string().trim().optional(),
  stockMinimo: z.coerce.number().int().min(0).default(0),
  stockIdeal: z.coerce.number().int().min(0).default(0),
  initialQuantity: z.coerce.number().int().min(0).default(0),
});

export const supplyUpdateSchema = supplyInputSchema.omit({ initialQuantity: true }).partial();

export const movementTypeValues = ["ENTRADA", "SALIDA", "AJUSTE"] as const;

export const supplyMovementInputSchema = z.object({
  supplyId: z.string(),
  type: z.enum(movementTypeValues),
  quantity: z.coerce.number().int().positive("Tiene que ser mayor a 0"),
  reason: z.string().trim().optional(),
});

export type SupplyInput = z.infer<typeof supplyInputSchema>;
export type SupplyUpdateInput = z.infer<typeof supplyUpdateSchema>;
export type SupplyMovementInput = z.infer<typeof supplyMovementInputSchema>;
