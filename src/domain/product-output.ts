import { z } from 'zod';

export const productOutputSchema = z
  .object({
    title: z.string().min(1).nullable(),
    normal_price: z.number().int().nonnegative().nullable(),
    discount_price: z.number().int().nonnegative().nullable(),
    product_url: z.string().url(),
    image_url: z.string().url().nullable(),
    status: z.enum(['success', 'error']),
    error_message: z.string().nullable(),
  })
  .strict()
  .superRefine((product, context) => {
    if (product.status === 'success' && product.error_message !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['error_message'],
        message: 'Produtos com sucesso não podem possuir mensagem de erro.',
      });
    }
    if (product.status === 'error' && !product.error_message?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['error_message'],
        message: 'Produtos com erro exigem uma mensagem.',
      });
    }
    if (
      product.normal_price !== null &&
      product.discount_price !== null &&
      product.discount_price > product.normal_price
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discount_price'],
        message: 'O preço com desconto não pode superar o preço normal.',
      });
    }
  });

export type ProductOutput = z.infer<typeof productOutputSchema>;
