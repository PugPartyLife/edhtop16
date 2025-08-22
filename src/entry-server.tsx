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
import {getPreferencesFromRequest, applyPreferenceMigrations, buildCookieHeader} from './lib/server/cookies';
import {schema} from './lib/server/schema';
import {App} from './pages/_app';

export function createHandler(
  template: string,
  persistedQueries: Record<string, string>,
  manifest?: Manifest,
) {
  const graphqlHandler = createYoga({
    schema,
    context: async (context) => {
      // Extract request for cookie parsing
      const request = context.request;
      return {
        request,
        // The createContext function will be called with this request
      };
    },
    plugins: [
      // eslint-disable-next-line react-hooks/rules-of-hooks
      usePersistedOperations({
        allowArbitraryOperations: true,
        extractPersistedOperationId: (
          params: GraphQLParams & {id?: unknown},
        ) => (typeof params.id === 'string' ? params.id : null),
        getPersistedOperation: (key) => persistedQueries[key] ?? null,
      }),
    ],
  });

  const entryPointHandler: express.Handler = async (req, res) => {
    const head = createHead();

    // Convert Express request to Web API Request for cookie parsing
    //console.log('Express req.headers.cookie:', req.headers.cookie);
    //console.log('Express req.headers:', Object.keys(req.headers));

    const webRequest = new Request(
      `${req.protocol}://${req.get('host')}${req.originalUrl}`,
      {
        method: req.method,
        headers: Object.entries(req.headers).reduce(
          (acc, [key, value]) => {
            if (typeof value === 'string') {
              acc[key] = value;
            } else if (Array.isArray(value)) {
              acc[key] = value.join(', ');
            }
            return acc;
          },
          {} as Record<string, string>,
        ),
      },
    );

    //console.log('Web request cookie header:', webRequest.headers.get('cookie'));

    // Create server environment with request to read cookies
    const env = createServerEnvironment(schema, persistedQueries, webRequest);

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

    let renderedHtml = await transformHtmlTemplate(
      head,
      template.replace(/<!--\s*@river:(\w+)\s*-->/g, evaluateRiverDirective),
    );

    // Enhanced server preferences handling with smart hydration
    try {
      const rawPreferences = getPreferencesFromRequest(webRequest);
      //console.log('Server preferences being processed:', rawPreferences);
      //console.log('Raw cookie header:', webRequest.headers.get('cookie'));

      // Apply migrations and enhancements
      const enhancedPreferences = applyPreferenceMigrations(rawPreferences);
      
      // Check if we need to update the cookie with migrations
      const needsCookieUpdate = JSON.stringify(rawPreferences) !== JSON.stringify(enhancedPreferences);
      
      if (needsCookieUpdate) {
        console.log('[Server] Applying preference migrations and updating cookie');
        
        try {
          const cookieValue = JSON.stringify(enhancedPreferences);
          const cookieHeader = buildCookieHeader('sitePreferences', cookieValue);
          res.setHeader('Set-Cookie', cookieHeader);
        } catch (cookieError) {
          console.error('[Server] Error setting updated preferences cookie:', cookieError);
        }
      }

      // Enhanced preferences injection with metadata for smart hydration
      const hydrationPayload = {
        preferences: enhancedPreferences,
        metadata: {
          serverRenderTime: Date.now(),
          version: enhancedPreferences._globalVersion || 1,
          hasMigrations: needsCookieUpdate,
          userAgent: req.headers['user-agent'] || '',
          url: req.originalUrl,
        },
      };

      const preferencesScript = `
        <script>
          window.__SERVER_PREFERENCES__ = ${JSON.stringify(enhancedPreferences)};
          window.__HYDRATION_METADATA__ = ${JSON.stringify(hydrationPayload.metadata)};
          ${process.env.NODE_ENV === 'development' ? `
            console.log('[Server] Preferences injected into page:', ${JSON.stringify(enhancedPreferences)});
            console.log('[Server] Hydration metadata:', ${JSON.stringify(hydrationPayload.metadata)});
          ` : ''}
        </script>
      `;
      
      renderedHtml = renderedHtml.replace(
        '</head>',
        `${preferencesScript}</head>`,
      );

      // Enhanced error tracking for development
      if (process.env.NODE_ENV === 'development') {
        const debugScript = `
          <script>
            window.__DEBUG_HYDRATION__ = true;
            window.addEventListener('error', function(e) {
              if (e.message.includes('hydration') || e.message.includes('preference')) {
                console.error('[Hydration Debug] Error detected:', e);
              }
            });
            
            // Log initial state for debugging
            console.log('[Debug] Initial cookies on page load:', document.cookie);
            console.log('[Debug] URL:', window.location.href);
          </script>
        `;
        
        renderedHtml = renderedHtml.replace(
          '</head>',
          `${debugScript}</head>`,
        );
      }

    } catch (error) {
      console.error('[Server] Error in enhanced preference processing:', error);
      
      // Fallback: inject empty preferences to prevent client errors
      const fallbackScript = `
        <script>
          window.__SERVER_PREFERENCES__ = {};
          window.__HYDRATION_METADATA__ = { 
            serverRenderTime: ${Date.now()}, 
            error: true,
            fallback: true 
          };
          console.warn('[Server] Preference processing failed, using fallback');
        </script>
      `;
      
      renderedHtml = renderedHtml.replace(
        '</head>',
        `${fallbackScript}</head>`,
      );
    }

    // Enhanced security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Optional: Add cache headers for better performance
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
    }

    res.status(200).set({'Content-Type': 'text/html'}).end(renderedHtml);
  };

  const r = express.Router();
  r.use('/api/graphql', graphqlHandler);
  for (const route of listRoutes()) {
    r.get(route, entryPointHandler);
  }

  return r;
}

// Enhanced debugging middleware (optional - use in your main server file)
export function createDebugMiddleware() {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Server Debug] ${req.method} ${req.url}`);
      console.log(`[Server Debug] Cookies:`, req.headers.cookie || 'None');
      
      // Add timing
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[Server Debug] Response completed in ${duration}ms`);
      });
    }
    
    next();
  };
}
