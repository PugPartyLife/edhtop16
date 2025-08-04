import {Environment, Network, RecordSource, Store} from 'relay-runtime';
import type {CommanderPreferences} from './cookies';

let relayCommanderPreferences: CommanderPreferences = {};

export function createClientNetwork() {
  return Network.create(async (params, variables) => {
    console.log('🚀 === NEW GRAPHQL REQUEST ===');
    console.log('🚀 Operation:', params.name);
    console.log('🚀 Variables:', variables);
    console.log('🚀 Preferences being sent:', relayCommanderPreferences);

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

    const json = await response.text();
    const parsed = JSON.parse(json);

    console.log('🚀 Response received:', {
      commanderCount: parsed?.data?.commanders?.edges?.length,
      firstCommander: parsed?.data?.commanders?.edges?.[0]?.node?.name,
    });
    console.log('🚀 === END REQUEST ===');

    return parsed;
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
