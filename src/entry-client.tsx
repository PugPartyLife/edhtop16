import {createRiverApp} from '#genfiles/river/router';
import {createHead, UnheadProvider} from '@unhead/react/client';
import {StrictMode} from 'react';
import {hydrateRoot} from 'react-dom/client';
import {RelayEnvironmentProvider} from 'react-relay/hooks';
import {getClientEnvironment} from './lib/client/relay_client_environment';
import {App} from './pages/_app';

// Enhanced hydration validation and error recovery
function validateHydrationEnvironment() {
  const errors: string[] = [];
  
  // Check for required globals
  if (typeof window === 'undefined') {
    errors.push('Window object not available');
  }
  
  if (!document.getElementById('root')) {
    errors.push('Root element not found');
  }
  
  // Validate server preferences injection
  const serverPrefs = (window as any).__SERVER_PREFERENCES__;
  const hydrationMeta = (window as any).__HYDRATION_METADATA__;
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[Client] Server preferences received:', serverPrefs);
    console.log('[Client] Hydration metadata:', hydrationMeta);
    
    if (!serverPrefs && !hydrationMeta?.fallback) {
      console.warn('[Client] No server preferences found - this may cause hydration mismatches');
    }
    
    if (hydrationMeta?.error) {
      console.warn('[Client] Server indicated preference processing error');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    serverPrefs,
    hydrationMeta,
  };
}

// Enhanced error boundary for hydration issues
function setupHydrationErrorHandling() {
  if (process.env.NODE_ENV === 'development') {
    // Track hydration errors
    const originalError = console.error;
    console.error = (...args) => {
      const message = args[0]?.toString() || '';
      
      if (message.includes('hydrat') || message.includes('mismatch')) {
        console.group('[Hydration Error Debug]');
        console.log('Arguments:', args);
        console.log('Server preferences:', (window as any).__SERVER_PREFERENCES__);
        console.log('Current cookies:', document.cookie);
        console.log('Hydration metadata:', (window as any).__HYDRATION_METADATA__);
        console.groupEnd();
      }
      
      originalError.apply(console, args);
    };
    
    // Global error handler for unhandled hydration issues
    window.addEventListener('error', (event) => {
      if (event.message.includes('hydrat') || event.message.includes('preference')) {
        console.error('[Global Hydration Error]', {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          serverPrefs: (window as any).__SERVER_PREFERENCES__,
          cookies: document.cookie,
        });
      }
    });
  }
}

// Performance monitoring for hydration
function setupHydrationPerformanceMonitoring() {
  if (process.env.NODE_ENV === 'development') {
    const hydrationStart = performance.now();
    
    // Monitor when hydration completes
    setTimeout(() => {
      const hydrationEnd = performance.now();
      const duration = hydrationEnd - hydrationStart;
      
      console.log(`[Performance] Client hydration took ${duration.toFixed(2)}ms`);
      
      // Check for any preference-related work after hydration
      const serverTime = (window as any).__HYDRATION_METADATA__?.serverRenderTime;
      if (serverTime) {
        const totalTime = Date.now() - serverTime;
        console.log(`[Performance] Total server-to-client time: ${totalTime}ms`);
      }
    }, 100);
  }
}

async function main() {
  try {
    // Validate hydration environment
    const validation = validateHydrationEnvironment();
    
    if (!validation.isValid) {
      console.error('[Client] Hydration validation failed:', validation.errors);
      // Could implement fallback behavior here
    }
    
    // Setup enhanced error handling and monitoring
    setupHydrationErrorHandling();
    setupHydrationPerformanceMonitoring();
    
    // Initialize head management
    const head = createHead();
    
    // Get client environment
    const env = getClientEnvironment()!;
    
    if (!env) {
      throw new Error('Failed to create Relay client environment');
    }
    
    // Create River app
    const RiverApp = await createRiverApp({getEnvironment: () => env});
    
    if (!RiverApp) {
      throw new Error('Failed to create River app');
    }
    
    // Enhanced development logging
    if (process.env.NODE_ENV === 'development') {
      console.log('[Client] Hydration starting with:', {
        hasServerPrefs: !!(window as any).__SERVER_PREFERENCES__,
        hasHydrationMeta: !!(window as any).__HYDRATION_METADATA__,
        currentCookies: document.cookie,
        timestamp: new Date().toISOString(),
      });
    }
    
    // Perform hydration
    hydrateRoot(
      document.getElementById('root')!,
      <StrictMode>
        <UnheadProvider head={head}>
          <RelayEnvironmentProvider environment={env}>
            <App>
              <RiverApp />
            </App>
          </RelayEnvironmentProvider>
        </UnheadProvider>
      </StrictMode>,
    );
    
    // Post-hydration setup
    if (process.env.NODE_ENV === 'development') {
      // Add debugging helpers to window for manual testing
      (window as any).__DEBUG_PREFERENCES__ = {
        getServerPrefs: () => (window as any).__SERVER_PREFERENCES__,
        getHydrationMeta: () => (window as any).__HYDRATION_METADATA__,
        getCurrentCookies: () => document.cookie,
        clearPrefs: () => {
          document.cookie = 'sitePreferences=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
          console.log('Preferences cleared, reload page to reset');
        },
      };
      
      console.log('[Debug] Preferences debugging helpers available at window.__DEBUG_PREFERENCES__');
    }
    
    console.log('[Client] Hydration completed successfully');
    
  } catch (error) {
    console.error('[Client] Fatal hydration error:', error);
    
    // Enhanced error recovery
    if (process.env.NODE_ENV === 'development') {
      // Show user-friendly error in development
      const errorDiv = document.createElement('div');
      errorDiv.innerHTML = `
        <div style="
          position: fixed;
          top: 20px;
          right: 20px;
          background: #ff4444;
          color: white;
          padding: 20px;
          border-radius: 8px;
          z-index: 9999;
          max-width: 400px;
          font-family: monospace;
          font-size: 14px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        ">
          <strong>Hydration Error</strong><br>
          <small>${error instanceof Error ? error.message : 'Unknown error'}</small><br><br>
          <button onclick="this.parentElement.parentElement.remove()" style="
            background: white;
            color: #ff4444;
            border: none;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
            margin-right: 10px;
          ">Dismiss</button>
          <button onclick="window.location.reload()" style="
            background: rgba(255,255,255,0.2);
            color: white;
            border: 1px solid white;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
          ">Reload</button>
        </div>
      `;
      document.body.appendChild(errorDiv);
    }
    
    // Attempt basic recovery in production
    if (process.env.NODE_ENV === 'production') {
      // Clear potentially corrupted preferences and reload
      try {
        document.cookie = 'sitePreferences=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        setTimeout(() => window.location.reload(), 1000);
      } catch (recoveryError) {
        console.error('[Client] Recovery attempt failed:', recoveryError);
      }
    }
  }
}

// Enhanced initialization with better error handling
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
