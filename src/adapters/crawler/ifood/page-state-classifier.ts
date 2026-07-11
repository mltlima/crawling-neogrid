import type {
  PageProbe,
  PageState,
  ProductOutput,
} from '../../../domain/index.js';

export function classifyPageState(
  page: PageProbe,
  product: ProductOutput | null,
): PageState {
  if (page.timedOut) {
    return 'NAVIGATION_TIMEOUT';
  }
  if (page.httpStatus === 403) {
    return 'ACCESS_BLOCKED';
  }
  if (page.httpStatus === 429) {
    return 'RATE_LIMITED';
  }
  if (page.httpStatus !== null && page.httpStatus >= 400) {
    return 'HTTP_ERROR';
  }
  const text = page.dom.bodyText.toLowerCase();
  if (/informe.*localiza|escolha.*endere/.test(text)) {
    return 'LOCATION_REQUIRED';
  }
  if (/loja (?:fechada|indisponível)|restaurante indisponível/.test(text)) {
    return 'STORE_UNAVAILABLE';
  }
  if (
    /produto indisponível|item indisponível/.test(text) ||
    product?.status === 'error'
  ) {
    return 'PRODUCT_UNAVAILABLE';
  }
  if (/captcha|acesso bloqueado|access denied/.test(text)) {
    return 'ACCESS_BLOCKED';
  }
  if (product?.status === 'success') {
    return 'PRODUCT_FOUND';
  }
  if (page.pageErrors.length > 0) {
    return 'PARSER_ERROR';
  }
  return 'UNKNOWN_PAGE_STATE';
}
