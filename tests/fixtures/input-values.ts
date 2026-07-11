export const MERCHANT_ID = '11111111-1111-4111-8111-111111111111';
export const SECOND_MERCHANT_ID = '33333333-3333-4333-8333-333333333333';
export const ITEM_ID = '22222222-2222-4222-8222-222222222222';
export const SECOND_ITEM_ID = '44444444-4444-4444-8444-444444444444';

export function makeIfoodUrl(
  merchantId: string = MERCHANT_ID,
  itemId: string = ITEM_ID,
): string {
  return `https://www.ifood.com.br/delivery/sao-paulo-sp/loja-teste/${merchantId}?item=${itemId}`;
}
