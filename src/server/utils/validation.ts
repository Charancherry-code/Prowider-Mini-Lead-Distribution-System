import { z } from "zod";

const optionalText = z.string().trim().min(1).optional();

export const createLeadSchema = z.object({
  fullName: z.string().trim().min(2),
  email: z.string().trim().email().optional(),
  phone: optionalText,
  source: optionalText,
});

export const createProviderSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  maxLoad: z.number().int().positive().max(100).optional(),
  isAcceptingLeads: z.boolean().optional(),
});

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
