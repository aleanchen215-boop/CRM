import { z } from "zod";

export const promotionItemKindValues = ["FIJO", "VARIABLE"] as const;

export const promotionItemInputSchema = z
  .object({
    kind: z.enum(promotionItemKindValues),
    quantity: z.coerce.number().int().positive("Tiene que ser mayor a 0"),
    productId: z.string().optional(),
    categoryId: z.string().optional(),
  })
  .refine((item) => (item.kind === "FIJO" ? !!item.productId : !!item.categoryId), {
    message: "Elegí un producto (fijo) o una categoría (variable)",
    path: ["productId"],
  });

export const promotionInputSchema = z.object({
  name: z.string().trim().min(1, "Requerido"),
  price: z.coerce.number().min(0, "No puede ser negativo"),
  items: z.array(promotionItemInputSchema).min(1, "Agregá al menos un renglón"),
});

export const promotionUpdateSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1, "Requerido").optional(),
  price: z.coerce.number().min(0, "No puede ser negativo").optional(),
  active: z.boolean().optional(),
  items: z.array(promotionItemInputSchema).min(1, "Agregá al menos un renglón").optional(),
});

export type PromotionInput = z.infer<typeof promotionInputSchema>;
export type PromotionItemInput = z.infer<typeof promotionItemInputSchema>;
