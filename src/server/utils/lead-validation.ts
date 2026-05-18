import { z } from "zod";

export const createLeadSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(255, "Name must not exceed 255 characters"),

  phone: z
    .string()
    .trim()
    .min(10, "Phone must be at least 10 digits")
    .max(15, "Phone must not exceed 15 digits")
    .regex(/^[0-9+]+$/, "Phone must contain only digits (optional + prefix)"),

  city: z
    .string()
    .trim()
    .min(2, "City must be at least 2 characters")
    .max(100, "City must not exceed 100 characters"),

  serviceId: z.string().cuid("Service is required"),

  description: z
    .string()
    .trim()
    .max(2000, "Description must not exceed 2000 characters")
    .optional()
    .nullable(),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export function validateCreateLeadRequest(data: unknown): CreateLeadInput {
  return createLeadSchema.parse(data);
}
