import {useState, useEffect, useRef, useCallback} from 'react';
import {updateRelayPreferences} from './relay_client_environment';

export interface CommanderPreferences {
  sortBy?: 'CONVERSION' | 'POPULARITY';
  timePeriod?: 'ONE_MONTH' | 'THREE_MONTHS' | 'SIX_MONTHS' | 'ONE_YEAR' | 'ALL_TIME' | 'POST_BAN';
  colorId?: string;
  minEntries?: number;
  minTournamentSize?: number;
  display?: 'card' | 'table';
}

const DEFAULT_PREFERENCES: CommanderPreferences = {
  sortBy: 'CONVERSION',
  timePeriod: 'ONE_MONTH',
  display: 'card',
  minEntries: 0,
  minTournamentSize: 0,
  colorId: '',
};

let refetchCallback: ((prefs?: CommanderPreferences) => void) | undefined = undefined;

export function setRefetchCallback(callback?: (prefs?: CommanderPreferences) => void) {
  refetchCallback = callback;
}

export function clearRefetchCallback() {
  refetchCallback = undefined;
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

function getServerPreferences(): CommanderPreferences {
  console.log('🍪 [INIT] Starting preference initialization...');
  
  try {
    const metaTag = document?.querySelector('meta[name="commander-preferences"]');
    if (metaTag) {
      const content = metaTag.getAttribute('content');
      console.log('🍪 [INIT] Meta tag content:', content);
      
      if (content) {
        const serverPrefs = JSON.parse(decodeURIComponent(content));
        console.log('🍪 [INIT] ✅ Using server preferences:', serverPrefs);
        
        metaTag.remove();
        console.log('🍪 [INIT] Meta tag removed');
        
        return serverPrefs;
      }
    } else {
      console.log('🍪 [INIT] No meta tag found - will use defaults');
    }
  } catch (error) {
    console.log('🍪 [INIT] Document not available (SSR) - using defaults');
  }
  
  console.log('🍪 [INIT] Using defaults:', DEFAULT_PREFERENCES);
  return DEFAULT_PREFERENCES;
}

// Track if we've already initialized to prevent double calls
let hasInitialized = false;

export function useCommanderPreferences() {
  const [preferences, setPreferences] = useState<CommanderPreferences>(() => {
    // Only initialize once
    if (hasInitialized) {
      return DEFAULT_PREFERENCES;
    }
    hasInitialized = true;
    return getServerPreferences();
  });
  
  const [isHydrated, setIsHydrated] = useState(false);
  const refetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasHydratedRef = useRef(false);

  useEffect(() => {
    // Prevent double hydration
    if (hasHydratedRef.current) return;
    hasHydratedRef.current = true;
    
    setIsHydrated(true);
    
    // Check if we need to load from cookies
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
          updateRelayPreferences(DEFAULT_PREFERENCES);
        }
      } else {
        console.log('🍪 Post-hydration: No cookies found, using defaults');
        updateRelayPreferences(DEFAULT_PREFERENCES);
      }
    } else {
      console.log('🍪 Post-hydration: Using server preferences:', preferences);
      updateRelayPreferences(preferences);
    }
  }, []); // Empty dependency array

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
      
      // Clear existing timeout
      if (refetchTimeoutRef.current) {
        clearTimeout(refetchTimeoutRef.current);
        refetchTimeoutRef.current = null;
      }
      
      // Debounce refetch calls
      refetchTimeoutRef.current = setTimeout(() => {
        console.log('🍪 Triggering refetch after preference change');
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