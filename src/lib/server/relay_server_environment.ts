import {graphql, GraphQLSchema} from 'graphql';
import {
  Environment,
  FetchFunction,
  Network,
  RecordSource,
  Store,
} from 'relay-runtime';
import {createContext} from './context';
import {TopdeckClient} from './topdeck';
import type {PreferencesMap} from '#src/lib/client/cookies';

const topdeckClient = new TopdeckClient();

export function createServerEnvironment(
  schema: GraphQLSchema,
  persistedQueries?: Record<string, string>,
  preferences?: PreferencesMap,
) {
  const networkFetchFunction: FetchFunction = async (request, variables) => {
    let source = request.text;
    if (source == null && request.id) {
      source = persistedQueries?.[request.id] ?? null;
    }

    if (source == null) {
      throw new Error(`Could not find source for query: ${request.id}`);
    }

    const contextValue = createContext(
      topdeckClient,
      preferences ?? {commanders: {}},
      () => {},
    );

    const results = await graphql({
      schema,
      source,
      variableValues: variables,
      contextValue,
    });

    return results as any;
  };

  return new Environment({
    network: Network.create(networkFetchFunction),
    store: new Store(new RecordSource()),
    isServer: true,
  });
}
