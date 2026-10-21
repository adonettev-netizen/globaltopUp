import { useEffect, useState, useCallback } from 'react';

export type Route = {
  path: string;
  params: Record<string, string>;
};

function parseHash(): Route {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const [path, queryString] = hash.split('?');
  const params: Record<string, string> = {};
  if (queryString) {
    new URLSearchParams(queryString).forEach((v, k) => {
      params[k] = v;
    });
  }
  return { path, params };
}

export function navigate(path: string) {
  window.location.hash = path;
}

export function useRouter() {
  const [route, setRoute] = useState<Route>(parseHash());

  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const go = useCallback((path: string) => {
    navigate(path);
  }, []);

  return { route, go };
}
