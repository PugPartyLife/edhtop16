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
  cookies: Record<string, string>, 
  commanderPreferences: ReturnType<typeof createDefaultPreferences>
} {
  console.log('🍪 Raw cookie header:', cookieHeader); // Debug line
  
  const cookies: Record<string, string> = {};
  
  if (!cookieHeader) {
    return { 
      cookies, 
      commanderPreferences: createDefaultPreferences()
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
      console.log('🍪 Decoded cookie value:', decoded); // Debug line
      const parsed = JSON.parse(decoded);
      console.log('🍪 Parsed cookie object:', parsed); // Debug line
      
      // FIX: Use nullish coalescing (??) instead of logical OR (||)
      // and be more explicit about what values to preserve
      commanderPreferences = {
        sortBy: parsed.sortBy ?? 'CONVERSION',
        timePeriod: parsed.timePeriod ?? 'ONE_MONTH', 
        display: parsed.display ?? 'card',
        minEntries: parsed.minEntries ?? 0,
        minTournamentSize: parsed.minTournamentSize ?? 0,
        colorId: parsed.colorId ?? '',
      };
      console.log('🍪 Final server preferences:', commanderPreferences);
    } catch (error) {
      console.warn('❌ Failed to parse commander preferences:', error);
    }
  }
  
  return { cookies, commanderPreferences };
}

const cookieCache = new WeakMap<Request, ReturnType<typeof parseCookies>>();


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
  // Check cache first
  if (cookieCache.has(request)) {
    const cached = cookieCache.get(request)!;
    return createContext(cached.commanderPreferences);
  }

  let commanderPreferences = createDefaultPreferences();

  try {
    const body = await request.clone().text();
    const parsed = JSON.parse(body);

    if (parsed.extensions?.commanderPreferences) {
      // FIX: Use nullish coalescing here too
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
      const cookieHeader = request.headers.get('cookie') || '';
      const result = parseCookies(cookieHeader);
      commanderPreferences = result.commanderPreferences;
      
      cookieCache.set(request, result);
    }
  } catch (error) {
    console.warn('❌ GraphQL Context: Failed to parse preferences:', error);
  }

  return createContext(commanderPreferences);
},
  });

  const entryPointHandler: express.Handler = async (req, res) => {
    const head = createHead();

    const { commanderPreferences } = parseCookies(req.headers.cookie || '');
    
    if (Object.keys(commanderPreferences).length > 0) {
      console.log('🏗️ SSR: Using preferences from cookies:', commanderPreferences);
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

const preferencesScript = `
<script>
  window.__SERVER_PREFERENCES__ = ${JSON.stringify(commanderPreferences)};
</script>`;

const htmlWithPreferences = renderedHtml.replace('</head>', `${preferencesScript}\n</head>`);
res.status(200).set({'Content-Type': 'text/html'}).end(htmlWithPreferences);
    };

  const r = express.Router();
  r.use('/api/graphql', graphqlHandler);
  for (const route of listRoutes()) {
    r.get(route, entryPointHandler);
  }

  return r;
}
