# DASH privacy statement

DASH is a desktop browser by Bibek Bista, an independent developer in Nepal. This page describes what DASH itself
does with your data. It does not describe what the websites you visit do.

## What DASH does not do

* **No telemetry, analytics, crash reporting or usage statistics.** DASH sends nothing about you or your use of the
  app to the developer or to anyone else.
* **No accounts and no sync service.** There is nothing to sign in to.
* **No advertising or tracking IDs.**

## Where your data lives

Browsing history, bookmarks, downloads list, settings, notes, saved offline pages and saved passwords are stored on
your own computer in DASH's data folder (on Windows: `%APPDATA%\DASH`). Saved passwords are encrypted with the
operating system's secure storage. Nothing here is uploaded by DASH. Backups you export are files you choose where to
save.

## Network connections DASH makes by itself

DASH loads the sites you ask for. Apart from that, these are the only connections it makes, and each is either off by
default, started by you, or goes to your own computer:

| Feature | What is contacted | When |
|---|---|---|
| Update check | The https address **you** enter under Settings → Updates | Only if you turn automatic updates on |
| Secure DNS (DNS-over-HTTPS) | The DNS provider you choose (Cloudflare by default when enabled) | Only if you turn Secure DNS on. Your DNS lookups then go to that provider |
| VPN / proxy | The proxy server you configure | Only if you configure and turn it on |
| "Check my IP" in VPN settings | `api.ipify.org` | Only when you press the button |
| Translate page | `translate.google.com`, with the page address | Only when you choose Translate. Google then sees that page address |
| Search suggestions | Your chosen search engine (Google, DuckDuckGo, Bing or Brave), with the text you are typing, no cookies | Only while you type a search in the address bar or on the New Tab page, and only if "Show search suggestions" is on (Settings → Search Engine). Never from a private tab |
| Install extension from the Chrome Web Store | `clients2.google.com` | Only when you install an extension |
| AI helper | A local Ollama server on your own computer (`127.0.0.1`) | Only when you use it. Nothing is sent to an online AI service |

Private tabs connect the VPN you set up (if "Private tabs connect my VPN automatically" is on) before they load
anything, and wipe their cookies, storage and cache when the last private tab closes. If no VPN is set up, the
private tab says so. A VPN changes who can see your traffic; it does not make you anonymous.

Websites you visit see your connection as usual. DASH's built-in tracker and ad blocking, container tabs, private
tabs and "Do Not Track / Global Privacy Control" signal (on by default, can be turned off) are there to reduce what
websites learn, but no browser can guarantee anonymity.

## Third parties

If you enable Secure DNS, translate a page, or install an extension, the provider you chose receives the request
described above and has its own privacy policy. DASH has no control over them.

## Children

DASH collects no personal data from anyone, including children.

## Changes and contact

Changes to this statement are tracked in this repository's history. Questions or concerns: open an issue at
<https://github.com/bibekbista0405/Dash-Browser/issues>.
