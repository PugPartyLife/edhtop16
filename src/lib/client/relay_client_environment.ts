import {Environment, Network, RecordSource, Store} from 'relay-runtime';
import type {CommandersPreferences, EntryPreferences} from './cookies';

type PreferencesMap = {
  commanders?: CommandersPreferences;
  entry?: EntryPreferences;
  // Add more as needed
};

let currentPreferences: PreferencesMap = {};

const requestCache = new Map<string, Promise<any>>();

export function createClientNetwork() {
  return Network.create(async (params, variables) => {
    const cacheKey = `${params.id || params.name}-${JSON.stringify(variables)}-${JSON.stringify(currentPreferences)}`;

    if (requestCache.has(cacheKey)) {
      return requestCache.get(cacheKey)!;
    }

    const requestPromise = (async () => {
      const requestBody = {
        query: params.text,
        id: params.id,
        variables,

        extensions: {
          sitePreferences: currentPreferences, // generalized key
        },
      };

      const response = await fetch('/api/graphql', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      requestCache.delete(cacheKey);

      return result;
    })();

    requestCache.set(cacheKey, requestPromise);

    return requestPromise;
  });
}

let clientEnv: Environment | undefined;
export function getClientEnvironment() {
  if (typeof window === 'undefined') return null;

  if (clientEnv == null) {
    clientEnv = new Environment({
      network: createClientNetwork(),
      store: new Store(new RecordSource()),
      isServer: false,
    });
  }

  return clientEnv;
}

export function updateRelayPreferences(prefs: Partial<PreferencesMap>) {
  currentPreferences = {...currentPreferences, ...prefs};
}

export function getRelayPreferences(): PreferencesMap {
  return currentPreferences;
}

export default getClientEnvironment();