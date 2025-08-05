import {Environment, Network, RecordSource, Store} from 'relay-runtime';
import type {CommanderPreferences} from './cookies';

let relayCommanderPreferences: CommanderPreferences = {};

const requestCache = new Map<string, Promise<any>>();

export function createClientNetwork() {
  return Network.create(async (params, variables) => {
    const cacheKey = `${params.id || params.name}-${JSON.stringify(variables)}-${JSON.stringify(relayCommanderPreferences)}`;
    
    if (requestCache.has(cacheKey)) {
      console.log('🚀 Using cached request for:', params.name);
      return requestCache.get(cacheKey)!;
    }
    
    console.log('🚀 New GraphQL Request:', params.name);
    
    const requestPromise = (async () => {
      const requestBody = {
        query: params.text,
        id: params.id,
        variables,
        extensions: {
          commanderPreferences: relayCommanderPreferences,
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

export function updateRelayPreferences(prefs: CommanderPreferences) {
  relayCommanderPreferences = {...prefs};
}

export function getRelayPreferences(): CommanderPreferences {
  return relayCommanderPreferences;
}

export default getClientEnvironment();
