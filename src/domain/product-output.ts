import { z } from 'zod';

export const productOutputSchema = z
  .object({
    title: z.string().min(1).nullable(),
    normal_price: z.number().nonnegative().nullable(),
    discount_price: z.number().nonnegative().nullable(),
    product_url: z.string().url(),
    image_url: z.string().url().nullable(),
    status: z.enum(['success', 'error']),
    error_message: z.string().nullable(),
  })
  .strict();

export type ProductOutput = z.infer<typeof productOutputSchema>;
