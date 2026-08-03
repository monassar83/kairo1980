/* One error type for every provider.

   It lives on its own because the routes above catch it with `instanceof`: if
   each provider declared its own class, a Stripe failure would fall through
   the handler written for PayPal and be reported to the guest as an internal
   error instead of a declined card. */

export class ProviderError extends Error {
  constructor(code, message, raw, status) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.raw = raw;
    this.status = status || 502;
  }
}
