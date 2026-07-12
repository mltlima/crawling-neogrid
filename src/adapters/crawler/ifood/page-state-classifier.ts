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
  // The document shell can load normally while the item API is denied by an
  // access gate. The product is unavailable to the crawler in that case too.
  if (page.responses.some((response) => response.summary.status === 403)) {
    return 'ACCESS_BLOCKED';
  }
  if (page.httpStatus === 429) {
    return 'RATE_LIMITED';
  }
  if (page.httpStatus !== null && page.httpStatus >= 400) {
    return 'HTTP_ERROR';
  }
  try {
    const finalUrl = new URL(page.finalUrl);
    if (finalUrl.pathname === '/' && finalUrl.searchParams.has('item')) {
      return 'REDIRECTED_TO_HOME';
    }
  } catch {
    // A malformed final URL is handled by the generic state below.
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
  if (
    /captcha|acesso bloqueado|access denied|antes de continuarmos|pressione e segure|confirma?r? que você é (?:um )?humano/.test(
      text,
    )
  ) {
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
