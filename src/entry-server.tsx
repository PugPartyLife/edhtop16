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

function createDefaultPreferences() {
  return {
    sortBy: 'CONVERSION' as const,
    timePeriod: 'ONE_MONTH' as const,
    display: 'card' as const,
    minEntries: 0,
    minTournamentSize: 0,
    colorId: '',
  };
}

function parseCookies(cookieHeader: string): {
  cookies: Record<string, string>;
  commanderPreferences: ReturnType<typeof createDefaultPreferences>;
} {
  // console.log('🍪 Raw cookie header:', cookieHeader);

  const cookies: Record<string, string> = {};

  if (!cookieHeader) {
    return {
      cookies,
      commanderPreferences: createDefaultPreferences(),
    };
  }

  cookieHeader.split(';').forEach((cookie) => {
    const [name, value] = cookie.trim().split('=');
    if (name && value) {
      cookies[name] = value;
    }
  });

  let commanderPreferences = createDefaultPreferences();

  if (cookies.commanderPreferences) {
    try {
      const decoded = decodeURIComponent(cookies.commanderPreferences);
      // console.log('🍪 Decoded cookie value:', decoded);
      const parsed = JSON.parse(decoded);
      // console.log('🍪 Parsed cookie object:', parsed);

      commanderPreferences = {
        sortBy: parsed.sortBy ?? 'CONVERSION',
        timePeriod: parsed.timePeriod ?? 'ONE_MONTH',
        display: parsed.display ?? 'card',
        minEntries: parsed.minEntries ?? 0,
        minTournamentSize: parsed.minTournamentSize ?? 0,
        colorId: parsed.colorId ?? '',
      };
      // console.log('🍪 Final server preferences:', commanderPreferences);
    } catch (error) {
      console.warn('❌ Failed to parse commander preferences:', error);
    }
  }

  return {cookies, commanderPreferences};
}

const cookieCache = new WeakMap<Request, ReturnType<typeof parseCookies>>();

const requestPreferencesCache = new WeakMap<
  Request,
  ReturnType<typeof createDefaultPreferences>
>();

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
      if (requestPreferencesCache.has(request)) {
        const cachedPrefs = requestPreferencesCache.get(request)!;
        // console.log('🔄 GraphQL Context: Using cached preferences for request');
        return createContext(cachedPrefs);
      }

      if (cookieCache.has(request)) {
        const cached = cookieCache.get(request)!;
        const prefs = cached.commanderPreferences;
        requestPreferencesCache.set(request, prefs); // Cache for this request
        return createContext(prefs);
      }

      let commanderPreferences = createDefaultPreferences();

      try {
        const body = await request.clone().text();
        const parsed = JSON.parse(body);

        if (parsed.extensions?.commanderPreferences) {
          // console.log('🔄 GraphQL Context: Using preferences from extensions');
          const extPrefs = parsed.extensions.commanderPreferences;
          commanderPreferences = {
            sortBy: extPrefs.sortBy ?? 'CONVERSION',
            timePeriod: extPrefs.timePeriod ?? 'ONE_MONTH',
            display: extPrefs.display ?? 'card',
            minEntries: extPrefs.minEntries ?? 0,
            minTournamentSize: extPrefs.minTournamentSize ?? 0,
            colorId: extPrefs.colorId ?? '',
          };
        } else {
          // console.log('🔄 GraphQL Context: Using preferences from cookies');
          const cookieHeader = request.headers.get('cookie') || '';
          const result = parseCookies(cookieHeader);
          commanderPreferences = result.commanderPreferences;

          cookieCache.set(request, result);
        }
      } catch (error) {
        console.warn('❌ GraphQL Context: Failed to parse preferences:', error);
      }

      requestPreferencesCache.set(request, commanderPreferences);
      return createContext(commanderPreferences);
    },
  });

  const entryPointHandler: express.Handler = async (req, res) => {
    const head = createHead();

    let commanderPreferences: ReturnType<typeof createDefaultPreferences>;

    if (requestPreferencesCache.has(req as any)) {
      commanderPreferences = requestPreferencesCache.get(req as any)!;
      // console.log('🏗️ SSR: Using cached preferences:', commanderPreferences);
    } else {
      const result = parseCookies(req.headers.cookie || '');
      commanderPreferences = result.commanderPreferences; // Use the EXACT same object
      requestPreferencesCache.set(req as any, commanderPreferences); // Cache it
      // console.log(
      //   '🏗️ SSR: Using preferences from cookies:',
      //   commanderPreferences,
      // );
    }

    const env = createServerEnvironment(
      schema,
      persistedQueries,
      commanderPreferences, // Same object used everywhere
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

    const preferencesScript = `
<script>
  console.log('🔍 [SERVER] Injecting preferences:', ${JSON.stringify(commanderPreferences)});
  window.__SERVER_PREFERENCES__ = ${JSON.stringify(commanderPreferences)};
</script>`;

    // console.log('🔍 [DEBUG] About to inject preferences script');
    // console.log('🔍 [DEBUG] Preferences to inject:', commanderPreferences);
    // console.log(
    //   '🔍 [DEBUG] HTML contains </head>?',
    //   renderedHtml.includes('</head>'),
    // );

    const htmlWithPreferences = renderedHtml.replace(
      '</head>',
      `${preferencesScript}\n</head>`,
    );

    // console.log(
    //   '🔍 [DEBUG] After injection, HTML contains script?',
    //   htmlWithPreferences.includes('window.__SERVER_PREFERENCES__'),
    // );

    res.status(200).set({'Content-Type': 'text/html'}).end(htmlWithPreferences);
  };

  const r = express.Router();
  r.use('/api/graphql', graphqlHandler);
  for (const route of listRoutes()) {
    r.get(route, entryPointHandler);
  }

  return r;
}
