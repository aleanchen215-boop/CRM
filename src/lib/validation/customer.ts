import { z } from "zod";

export const customerStatusValues = ["ACTIVO", "INACTIVO", "PERDIDO"] as const;

export const customerInputSchema = z.object({
  firstName: z.string().trim().min(1, "Requerido"),
  lastName: z.string().trim().min(1, "Requerido"),
  whatsapp: z
    .string()
    .trim()
    .min(6, "Número inválido")
    .regex(/^\+?[0-9\s-]+$/, "Solo números, espacios y guiones"),
  email: z.union([z.literal(""), z.email("Email inválido")]).optional(),
  address: z.string().trim().min(1, "Requerido"),
  city: z.string().trim().optional(),
  province: z.string().trim().optional(),
  country: z.string().trim().optional(),
  origin: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const customerUpdateSchema = customerInputSchema.partial().extend({
  status: z.enum(customerStatusValues).optional(),
});

export type CustomerInput = z.infer<typeof customerInputSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;
