/**
 * Single source of truth for IPC channel names — this file is intentionally
 * Electron-specific (IPC is a transport concept, not a browser-domain one)
 * and lives in apps/desktop rather than @dash/browser-core. Everything
 * else below is re-exported from the platform-independent package so every
 * existing import of "../../shared/ipc-channels" keeps working unchanged.
 */
export * from '@dash/browser-core';

export const IPC = {
  TAB_CREATE: 'tab:create',
  TAB_CLOSE: 'tab:close',
  TAB_SWITCH: 'tab:switch',
  TAB_NAVIGATE: 'tab:navigate',
  TAB_GO_BACK: 'tab:go-back',
  TAB_GO_FORWARD: 'tab:go-forward',
  TAB_GO_HOME: 'tab:go-home',
  TAB_RELOAD: 'tab:reload',
  TAB_STOP: 'tab:stop',
  TAB_STATE_CHANGED: 'tab:state-changed', // main -> renderer push
  TABS_SNAPSHOT: 'tabs:snapshot', // renderer requests full list

  HISTORY_QUERY: 'history:query',
  HISTORY_DELETE: 'history:delete',
  HISTORY_CLEAR: 'history:clear',

  BOOKMARK_ADD: 'bookmark:add',
  BOOKMARK_REMOVE: 'bookmark:remove',
  BOOKMARK_LIST: 'bookmark:list',

  DOWNLOAD_LIST: 'download:list',
  DOWNLOAD_CANCEL: 'download:cancel',
  DOWNLOAD_PAUSE: 'download:pause',
  DOWNLOAD_RESUME: 'download:resume',
  DOWNLOAD_REMOVE: 'download:remove',
  DOWNLOAD_OPEN_FILE: 'download:open-file',
  DOWNLOAD_SHOW_IN_FOLDER: 'download:show-in-folder',
  DOWNLOAD_START_DRAG: 'download:start-drag',
  DOWNLOAD_STATE_CHANGED: 'download:state-changed', // main -> renderer push

  SETTINGS_GET_ALL: 'settings:get-all',
  SETTINGS_SET: 'settings:set',
  SETTINGS_RESET: 'settings:reset',
  SETTINGS_STATE_CHANGED: 'settings:state-changed', // main -> renderer push

  BLOCK_STATS_GET: 'block-stats:get',

  PRIVACY_CLEAR_BROWSING_DATA: 'privacy:clear-browsing-data',

  EXTENSIONS_LOAD: 'extensions:load',
  EXTENSIONS_LIST: 'extensions:list',
  EXTENSIONS_REMOVE: 'extensions:remove',

  TASK_MANAGER_SNAPSHOT: 'task-manager:snapshot',
  TASK_MANAGER_END_PROCESS: 'task-manager:end-process',

  PASSWORD_ADD: 'password:add',
  PASSWORD_LIST: 'password:list',
  PASSWORD_REVEAL: 'password:reveal',
  PASSWORD_REMOVE: 'password:remove',
  PASSWORD_SAVE_PROMPT: 'password:save-prompt', // main -> renderer push (detected login form)
  PASSWORD_SAVE_PROMPT_RESPOND: 'password:save-prompt-respond',

  PERMISSION_LIST: 'permission:list',
  PERMISSION_SET: 'permission:set',
  PERMISSION_REMOVE: 'permission:remove',
  PERMISSION_REQUEST_PROMPT: 'permission:request-prompt', // main -> renderer push
  PERMISSION_REQUEST_RESPOND: 'permission:request-respond',

  FIND_IN_PAGE_START: 'find:start',
  FIND_IN_PAGE_NEXT: 'find:next',
  FIND_IN_PAGE_PREV: 'find:prev',
  FIND_IN_PAGE_STOP: 'find:stop',
  FIND_IN_PAGE_RESULT: 'find:result', // main -> renderer push

  ZOOM_IN: 'zoom:in',
  ZOOM_OUT: 'zoom:out',
  ZOOM_RESET: 'zoom:reset',

  TAB_DUPLICATE: 'tab:duplicate',
  TAB_TOGGLE_PIN: 'tab:toggle-pin',
  TAB_TOGGLE_MUTE: 'tab:toggle-mute',
  TAB_REOPEN_CLOSED: 'tab:reopen-closed',
  TAB_REORDER: 'tab:reorder',

  PAGE_PRINT: 'page:print',
  PAGE_SAVE: 'page:save',
  DEVTOOLS_TOGGLE: 'devtools:toggle',

  BOOKMARKS_EXPORT: 'bookmarks:export',
  BOOKMARKS_IMPORT: 'bookmarks:import',

  SUGGESTIONS_QUERY: 'suggestions:query',

  WINDOW_NEW: 'window:new',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
} as const;

