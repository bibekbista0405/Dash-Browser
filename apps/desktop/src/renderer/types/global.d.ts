import type { DashApi } from '../../preload/index';

declare global {
  interface Window {
    dash: DashApi;
  }
}

export {};
