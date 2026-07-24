import { z } from "zod";

export const productInputSchema = z.object({
  sku: z.string().trim().min(1, "Requerido"),
  internalCode: z.string().trim().optional(),
  name: z.string().trim().min(1, "Requerido"),
  category: z.string().trim().optional(),
  supplier: z.string().trim().optional(),
  cost: z.coerce.number().min(0, "No puede ser negativo"),
  price: z.coerce.number().min(0, "No puede ser negativo"),
  stockMinimo: z.coerce.number().int().min(0).default(0),
  stockIdeal: z.coerce.number().int().min(0).default(0),
  location: z.string().trim().optional(),
  initialStock: z.coerce.number().int().min(0).default(0),
});

export const productUpdateSchema = productInputSchema
  .omit({ initialStock: true })
  .partial();

export const movementTypeValues = ["ENTRADA", "SALIDA", "AJUSTE"] as const;

export const stockMovementInputSchema = z.object({
  productId: z.string(),
  type: z.enum(movementTypeValues),
  quantity: z.coerce.number().int().positive("Tiene que ser mayor a 0"),
  reason: z.string().trim().optional(),
});

export type ProductInput = z.infer<typeof productInputSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type StockMovementInput = z.infer<typeof stockMovementInputSchema>;
