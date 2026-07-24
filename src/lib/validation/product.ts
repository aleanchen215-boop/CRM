import { z } from "zod";

export const productInputSchema = z.object({
  sku: z.string().trim().min(1, "Requerido"),
  internalCode: z.string().trim().optional(),
  name: z.string().trim().min(1, "Requerido"),
  category: z.string().trim().optional(),
  supplier: z.string().trim().optional(),
  cost: z.coerce.number().min(0, "No puede ser negativo"),
  price: z.coerce.number().min(0, "No puede ser negativo"),
});

export const productUpdateSchema = productInputSchema.partial();

export type ProductInput = z.infer<typeof productInputSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
