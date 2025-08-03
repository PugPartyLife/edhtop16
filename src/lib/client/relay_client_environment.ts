import {Environment, Network, RecordSource, Store} from 'relay-runtime';
import type { CommanderPreferences } from './cookies';

export function createClientNetwork() {
  return Network.create(async (params, variables) => {
    const response = await fetch('/api/graphql', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: params.text,
        id: params.id,
        variables,
        extensions: {},
      }),
    });

    const json = await response.text();
    return JSON.parse(json);
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

let commanderPreferences: CommanderPreferences = {};

const fetchQuery = async (operation: any, variables: any) => {
  const response = await fetch('/api/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: operation.text,
      variables,
      extensions: {
        commanderPreferences,
      },
    }),
  });
  
  return response.json();
};

const environment = new Environment({
  network: Network.create(fetchQuery),
  store: new Store(new RecordSource()),
});

export function updateRelayPreferences(prefs: CommanderPreferences) {
  commanderPreferences = { ...commanderPreferences, ...prefs };
}

export function getRelayPreferences(): CommanderPreferences {
  return commanderPreferences;
}

export default environment;
