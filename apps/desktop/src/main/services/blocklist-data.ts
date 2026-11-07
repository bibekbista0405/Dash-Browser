/**
 * The blocklist domain data and classifier now live in @dash/browser-core
 * since they're pure logic with zero Electron dependency — every future
 * platform's network layer should classify hosts identically. This file is
 * kept as a thin re-export so existing imports of "./blocklist-data"
 * elsewhere in apps/desktop don't need to change.
 */
export * from '@dash/browser-core';
