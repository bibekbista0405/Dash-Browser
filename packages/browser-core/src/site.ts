/** Second-level suffixes where the registrable domain has three labels (co.uk, com.au, ...). Not the full Public Suffix List. */
const TWO_LEVEL_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.jp', 'ne.jp', 'or.jp',
  'com.br', 'com.cn', 'com.mx', 'com.tr', 'com.sg', 'com.hk', 'com.tw', 'co.in', 'co.kr', 'co.za', 'com.ar',
]);

/** Approximate registrable domain ("eTLD+1"): a.b.example.com -> example.com, x.example.co.uk -> example.co.uk. */
export function registrableDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host || /^[\d.]+$/.test(host) || host.includes(':')) return host; // IPs and IPv6 are their own site
  const labels = host.split('.');
  if (labels.length <= 2) return host;
  const lastTwo = labels.slice(-2).join('.');
  return TWO_LEVEL_SUFFIXES.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
}

/** True when a request to `requestHost` made from a page on `topHost` is cross-site. Unknown top host counts as first-party. */
export function isThirdParty(requestHost: string, topHost: string): boolean {
  if (!requestHost || !topHost) return false;
  if (isSignInProvider(requestHost)) return false; // sign-in and CAPTCHA providers must keep their cookies everywhere
  return registrableDomain(requestHost) !== registrableDomain(topHost);
}


/**
 * Sites that run "Sign in with ..." and bot-check flows. Their requests are never treated as third-party and are not
 * stripped of cookies or client hints, because stripping them silently breaks sign-in boxes, SSO frames and CAPTCHAs
 * on every site that embeds them. Matched on the registrable domain.
 */
const SIGN_IN_PROVIDERS = new Set([
  'google.com', 'gstatic.com', 'googleusercontent.com', 'youtube.com', 'gmail.com',
  'facebook.com', 'fbcdn.net', 'instagram.com', 'meta.com',
  'github.com', 'githubusercontent.com',
  'microsoft.com', 'microsoftonline.com', 'live.com', 'msauth.net', 'msftauth.net', 'office.com', 'linkedin.com',
  'apple.com', 'icloud.com',
  'twitter.com', 'x.com', 'discord.com', 'spotify.com', 'amazon.com', 'paypal.com',
  'auth0.com', 'okta.com', 'oktacdn.com', 'clerk.com', 'firebaseapp.com', 'stripe.com',
  'hcaptcha.com', 'recaptcha.net', 'cloudflare.com', 'arkoselabs.com', 'funcaptcha.com',
]);

export function isSignInProvider(hostname: string): boolean {
  return SIGN_IN_PROVIDERS.has(registrableDomain(hostname));
}
