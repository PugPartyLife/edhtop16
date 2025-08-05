import {listRoutes} from '#genfiles/river/router';
import {createRiverServerApp} from '#genfiles/river/server_router';
import {usePersistedOperations} from '@graphql-yoga/plugin-persisted-operations';
import {
  createHead,
  transformHtmlTemplate,
  UnheadProvider,
} from '@unhead/react/server';
import express from 'express';
import {createYoga, GraphQLParams} from 'graphql-yoga';
import {StrictMode} from 'react';
import {renderToString} from 'react-dom/server';
import {RelayEnvironmentProvider} from 'react-relay/hooks';
import type {Manifest} from 'vite';
import {createServerEnvironment} from './lib/server/relay_server_environment';
import {schema} from './lib/server/schema';
import {TopdeckClient} from './lib/server/topdeck';
import {App} from './pages/_app';
import {createContext} from './lib/server/context';
import type {CommanderPreferences} from './lib/client/cookies';

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach((cookie) => {
    const [name, value] = cookie.trim().split('=');
    if (name && value) {
      cookies[name] = decodeURIComponent(value);
    }
  });

  return cookies;
}

export function useCreateHandler(
  template: string,
  persistedQueries: Record<string, string>,
  manifest?: Manifest,
) {
  const graphqlHandler = createYoga({
    schema,
    plugins: [
      usePersistedOperations({
        allowArbitraryOperations: true,
        extractPersistedOperationId: (
          params: GraphQLParams & {id?: unknown},
        ) => (typeof params.id === 'string' ? params.id : null),
        getPersistedOperation: (key) => persistedQueries[key] ?? null,
      }),
    ],
    context: async ({request}) => {
      let commanderPreferences: CommanderPreferences = {};

      try {
        const body = await request.clone().text();
        const parsed = JSON.parse(body);

        if (parsed.extensions?.commanderPreferences) {
          console.log(
            '🎯 GraphQL Context: Using preferences from extensions:',
            parsed.extensions.commanderPreferences,
          );
          commanderPreferences = parsed.extensions.commanderPreferences;
        } else {
          const cookieHeader = request.headers.get('cookie') || '';
          const cookies = parseCookies(cookieHeader);
          const cookiePrefs = cookies.commanderPreferences;

          if (cookiePrefs) {
            commanderPreferences = JSON.parse(decodeURIComponent(cookiePrefs));
            console.log(
              '🎯 GraphQL Context: Using preferences from cookies:',
              commanderPreferences,
            );
          }
        }
      } catch (error) {
        console.warn('❌ GraphQL Context: Failed to parse preferences:', error);
      }

      return createContext(commanderPreferences);
    },
  });

  const entryPointHandler: express.Handler = async (req, res) => {
    const head = createHead();

    let commanderPreferences: CommanderPreferences = {};
    try {
      const cookies = parseCookies(req.headers.cookie || '');
      const cookiePrefs = cookies.commanderPreferences;

      if (cookiePrefs) {
        commanderPreferences = JSON.parse(decodeURIComponent(cookiePrefs));
        console.log(
          '🏗️ SSR: Using preferences from cookies:',
          commanderPreferences,
        );
      }
    } catch (error) {
      console.warn('❌ SSR: Failed to parse preferences from cookies:', error);
    }

    const env = createServerEnvironment(
      schema,
      persistedQueries,
      commanderPreferences,
    );

    const RiverApp = await createRiverServerApp(
      {getEnvironment: () => env},
      req.originalUrl,
    );

    function evaluateRiverDirective(match: string, directive: string) {
      switch (directive) {
        case 'render':
          return renderToString(
            <StrictMode>
              <UnheadProvider value={head}>
                <RelayEnvironmentProvider environment={env}>
                  <App>
                    <RiverApp />
                  </App>
                </RelayEnvironmentProvider>
              </UnheadProvider>
            </StrictMode>,
          );
        case 'bootstrap':
          return RiverApp.bootstrap(manifest) ?? match;
        default:
          return match;
      }
    }

    const renderedHtml = await transformHtmlTemplate(
      head,
      template.replace(/<!--\s*@river:(\w+)\s*-->/g, evaluateRiverDirective),
    );

    res.status(200).set({'Content-Type': 'text/html'}).end(renderedHtml);
  };

  const r = express.Router();
  r.use('/api/graphql', graphqlHandler);
  for (const route of listRoutes()) {
    r.get(route, entryPointHandler);
  }

  return r;
}
