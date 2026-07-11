import {
  productOutputSchema,
  type ProductOutput,
} from '../../../domain/index.js';

type JsonObject = Readonly<Record<string, unknown>>;

function asObject(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function firstString(
  object: JsonObject,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim().replace(/\s+/g, ' ');
    }
  }
  return null;
}

function firstNumber(
  object: JsonObject,
  keys: readonly string[],
): number | null {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.round(value);
    }
  }
  return null;
}

export function parsePriceToCents(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const cleaned = value.replace(/[^\d,.-]/g, '').trim();
  if (!cleaned) {
    return null;
  }
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0
    ? Math.round(amount * 100)
    : null;
}

export function findProductObject(
  value: unknown,
  itemId: string,
  depth = 0,
): JsonObject | null {
  if (depth > 8) {
    return null;
  }
  const object = asObject(value);
  if (object !== null) {
    const id = firstString(object, ['id', 'itemId', 'item_id']);
    const title = firstString(object, ['name', 'title', 'description']);
    if (
      id !== null &&
      id.toLowerCase() === itemId.toLowerCase() &&
      title !== null &&
      ('price' in object || 'value' in object)
    ) {
      return object;
    }
    for (const child of Object.values(object)) {
      const found = findProductObject(child, itemId, depth + 1);
      if (found !== null) {
        return found;
      }
    }
  } else if (Array.isArray(value)) {
    for (const child of value) {
      const found = findProductObject(child, itemId, depth + 1);
      if (found !== null) {
        return found;
      }
    }
  }
  return null;
}

export function productFromObject(
  object: JsonObject,
  productUrl: string,
): ProductOutput | null {
  const title = firstString(object, ['name', 'title', 'description']);
  if (title === null) {
    return null;
  }
  const priceObject = asObject(object.price);
  const current =
    firstNumber(object, ['value', 'priceValue', 'currentPrice']) ??
    (priceObject === null
      ? null
      : firstNumber(priceObject, ['value', 'current', 'discountValue']));
  const original =
    firstNumber(object, ['originalValue', 'originalPrice']) ??
    (priceObject === null
      ? null
      : firstNumber(priceObject, ['originalValue', 'original', 'listPrice']));
  if (current === null) {
    return null;
  }
  const available =
    object.available !== false && object.status !== 'UNAVAILABLE';
  const image = firstString(object, ['imageUrl', 'image', 'logoUrl']);
  const normalPrice = original ?? current;
  const discountPrice =
    original !== null && current < original ? current : null;
  return productOutputSchema.parse({
    title,
    normal_price: normalPrice,
    discount_price: discountPrice,
    product_url: productUrl,
    image_url: image !== null && URL.canParse(image) ? image : null,
    status: available ? 'success' : 'error',
    error_message: available ? null : 'Produto indisponível.',
  });
}

export function productFromDom(
  title: string | null,
  normalPriceText: string | null,
  discountPriceText: string | null,
  imageUrl: string | null,
  productUrl: string,
): ProductOutput | null {
  if (title === null) {
    return null;
  }
  const firstPrice = parsePriceToCents(normalPriceText);
  const secondPrice = parsePriceToCents(discountPriceText);
  if (firstPrice === null) {
    return null;
  }
  const normalPrice =
    secondPrice === null ? firstPrice : Math.max(firstPrice, secondPrice);
  const discountPrice =
    secondPrice === null ? null : Math.min(firstPrice, secondPrice);
  return productOutputSchema.parse({
    title: title.trim().replace(/\s+/g, ' '),
    normal_price: normalPrice,
    discount_price: discountPrice === normalPrice ? null : discountPrice,
    product_url: productUrl,
    image_url: imageUrl !== null && URL.canParse(imageUrl) ? imageUrl : null,
    status: 'success',
    error_message: null,
  });
}
