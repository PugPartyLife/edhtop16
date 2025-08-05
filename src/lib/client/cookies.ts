import {useState, useEffect, useRef, useCallback} from 'react';
import {updateRelayPreferences} from './relay_client_environment';
import type {
  CommandersSortBy,
  TimePeriod,
} from '#genfiles/queries/pages_CommandersQuery.graphql';

let globalServerPreferences: CommanderPreferences | null = null;
let hasInitializedFromServer = false;

function getServerPreferences(): CommanderPreferences {
  // If we already read server preferences, return cached version
  if (hasInitializedFromServer && globalServerPreferences) {
    console.log('🍪 [CACHE] Using cached server preferences:', globalServerPreferences);
    return globalServerPreferences;
  }

  console.log('🍪 [INIT] Starting preference initialization...');
  
  // Remove typeof document check - handle gracefully instead
  try {
    const metaTag = document?.querySelector('meta[name="commander-preferences"]');
    if (metaTag) {
      const content = metaTag.getAttribute('content');
      console.log('🍪 [INIT] Meta tag content:', content);
      
      if (content) {
        const serverPrefs = JSON.parse(decodeURIComponent(content));
        console.log('🍪 [INIT] ✅ Using server preferences:', serverPrefs);
        
        // Cache globally and mark as initialized
        globalServerPreferences = serverPrefs;
        hasInitializedFromServer = true;
        
        // Remove meta tag since we've read it
        metaTag.remove();
        console.log('🍪 [INIT] Meta tag removed and preferences cached globally');
        
        return serverPrefs;
      }
    } else {
      console.log('🍪 [INIT] No meta tag found - will use defaults');
    }
  } catch (error) {
    // Silently handle server-side errors where document doesn't exist
    console.log('🍪 [INIT] Document not available (SSR) - using defaults');
  }
  
  console.log('🍪 [INIT] Using defaults:', DEFAULT_PREFERENCES);
  hasInitializedFromServer = true;
  globalServerPreferences = DEFAULT_PREFERENCES;
  return DEFAULT_PREFERENCES;
}

export interface CommanderPreferences {
  sortBy?: CommandersSortBy;
  timePeriod?: TimePeriod;
  colorId?: string;
  minEntries?: number;
  minTournamentSize?: number;
  display?: 'card' | 'table';
}

function getCookie(name: string): string | null {
  try {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
      return parts.pop()?.split(';').shift() || null;
    }
  } catch (error) {
    // Handle server-side gracefully
  }
  return null;
}

function setCookie(name: string, value: string, days: number = 365) {
  try {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires.toUTCString()}; path=/; SameSite=Strict`;
  } catch (error) {
    // Handle server-side gracefully
  }
}

let refetchCallback: ((prefs?: CommanderPreferences) => void) | undefined = undefined;

export function setRefetchCallback(callback?: (prefs?: CommanderPreferences) => void) {
  refetchCallback = callback;
}

export function clearRefetchCallback() {
  refetchCallback = undefined;
}

const DEFAULT_PREFERENCES: CommanderPreferences = {
  sortBy: 'CONVERSION',
  timePeriod: 'ONE_MONTH',
  display: 'card',
  minEntries: 0,
  minTournamentSize: 0,
  colorId: '',
};

export function useCommanderPreferences() {
  const [preferences, setPreferences] = useState<CommanderPreferences>(getServerPreferences);
  const [isHydrated, setIsHydrated] = useState(false);
  const refetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setIsHydrated(true);
    
    // Only read from cookies if we're still using defaults (no server preferences found)
    const isUsingDefaults = JSON.stringify(preferences) === JSON.stringify(DEFAULT_PREFERENCES);
    
    if (isUsingDefaults) {
      const cookieValue = getCookie('commanderPreferences');
      if (cookieValue) {
        try {
          const savedPrefs = JSON.parse(decodeURIComponent(cookieValue));
          console.log('🍪 Post-hydration: Found preferences in cookies:', savedPrefs);
          
          const mergedPrefs = { ...DEFAULT_PREFERENCES, ...savedPrefs };
          setPreferences(mergedPrefs);
          updateRelayPreferences(mergedPrefs);
        } catch (error) {
          console.warn('❌ Post-hydration: Failed to parse preferences:', error);
        }
      } else {
        updateRelayPreferences(DEFAULT_PREFERENCES);
      }
    } else {
      // We already have server preferences, just update Relay
      console.log('🍪 Using server preferences, updating Relay:', preferences);
      updateRelayPreferences(preferences);
    }
  }, []); // No dependencies to avoid loops

  useEffect(() => {
    console.log('🍪 Preferences state changed:', preferences);
  }, [preferences]);

  const updatePreference = useCallback((key: keyof CommanderPreferences, value: any) => {
    console.log('🍪 updatePreference called:', key, '=', value);
    
    setPreferences(prevPrefs => {
      const newPrefs = { ...prevPrefs };
      
      if (!value || value === '' || value === null) {
        delete newPrefs[key];
      } else {
        newPrefs[key] = value;
      }
      
      console.log('🍪 Setting new preferences:', newPrefs);
      
      setCookie('commanderPreferences', JSON.stringify(newPrefs));
      updateRelayPreferences(newPrefs);
      
      if (refetchTimeoutRef.current) {
        clearTimeout(refetchTimeoutRef.current);
        refetchTimeoutRef.current = null;
      }
      
      refetchTimeoutRef.current = setTimeout(() => {
        console.log('🍪 Triggering refetch with immediate preferences:', newPrefs);
        if (refetchCallback) {
          refetchCallback(newPrefs);
        }
        refetchTimeoutRef.current = null;
      }, 250);
      
      return newPrefs;
    });
  }, []);

  return { preferences, updatePreference, isHydrated };
}
