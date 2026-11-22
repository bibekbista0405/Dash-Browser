import { useEffect, useState } from 'react';
import type { ContainerInfo } from '../../shared/ipc-channels';

/** The user's containers, kept in step with changes made anywhere (Settings, another window). */
export function useContainers(): ContainerInfo[] {
  const [list, setList] = useState<ContainerInfo[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => void window.dash.containers.list().then((l) => alive && setList(l));
    load();
    const off = window.dash.containers.onChanged(load);
    return () => {
      alive = false;
      off();
    };
  }, []);
  return list;
}

export const CONTAINER_HEX: Record<string, string> = {
  blue: '#5b8cff',
  orange: '#f0894a',
  green: '#4fbf7f',
  red: '#ef5b5b',
  purple: '#a77bf0',
  pink: '#e86fb0',
  cyan: '#3cc4d6',
  yellow: '#e5b93c',
};
