import { describe, expect, it } from 'vitest';
import { isSignInProvider, isThirdParty } from '@dash/browser-core';

describe('sign-in providers', () => {
  it('recognises provider hosts and their subdomains', () => {
    for (const h of ['accounts.google.com', 'www.facebook.com', 'github.com', 'login.microsoftonline.com', 'appleid.apple.com', 'challenges.cloudflare.com']) {
      expect(isSignInProvider(h)).toBe(true);
    }
  });
  it('does not exempt ordinary or look-alike hosts', () => {
    for (const h of ['example.com', 'google.com.evil.net', 'notgithub.com', 'facebook.com.phish.io']) {
      expect(isSignInProvider(h)).toBe(false);
    }
  });
  it('never counts a provider request as third-party', () => {
    expect(isThirdParty('accounts.google.com', 'some-shop.com')).toBe(false);
    expect(isThirdParty('tracker.example.net', 'some-shop.com')).toBe(true);
  });
});
