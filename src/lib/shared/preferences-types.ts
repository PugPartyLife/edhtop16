// Import the Relay-generated types
import type {
  CommandersSortBy,
  TimePeriod,
} from '#genfiles/queries/pages_CommandersQuery.graphql';

export interface CommandersPreferences {
  sortBy?: CommandersSortBy;
  timePeriod?: TimePeriod;
  colorId?: string;
  minEntries?: number;
  minTournamentSize?: number;
  display?: 'card' | 'table';
  statsDisplay?: 'count' | 'topCuts';
}

export interface EntryPreferences {
  maxStanding?: number | null;
  minEventSize?: number | null;
  sortBy?: 'TOP' | 'NEW';
  timePeriod?: TimePeriod;
}

export interface TournamentPreferences {
  tab?: 'entries' | 'breakdown' | 'commander';
  commander?: string | null;
}

export interface TournamentsPreferences {
  sortBy?: 'PLAYERS' | 'DATE';
  timePeriod?: TimePeriod;
  minSize?: number;
}

export type PreferencesMap = {
  commanders?: CommandersPreferences;
  entry?: EntryPreferences;
  tournament?: TournamentPreferences;
  tournaments?: TournamentsPreferences;
};

export const DEFAULT_PREFERENCES: PreferencesMap = {
  commanders: {
    sortBy: 'CONVERSION' as CommandersSortBy,
    timePeriod: 'ONE_MONTH' as TimePeriod,
    display: 'card',
    minEntries: 0,
    minTournamentSize: 0,
    colorId: '',
    statsDisplay: 'topCuts',
  },
  entry: {
    maxStanding: null,
    minEventSize: null,
    sortBy: 'TOP',
    timePeriod: 'ONE_YEAR' as TimePeriod,
  },
  tournament: {
    tab: 'entries',
    commander: null,
  },
  tournaments: {
    sortBy: 'DATE',
    timePeriod: 'ALL_TIME' as TimePeriod,
    minSize: 0,
  },
};

export interface HydrationMetadata {
  _serverHydrationTime?: number;
  _lastUpdated?: number;
  _clientUpdate?: boolean;
  _version?: number;
  _migrated?: number;
  _globalVersion?: number;
  _lastServerRender?: number;
}

// Enhanced preference types that include metadata
export type EnhancedPreferencesMap = PreferencesMap & HydrationMetadata;

// Helper type for individual preference sections with metadata
export type EnhancedPreference<T> = T & HydrationMetadata;

// Type guards for checking if preferences have hydration metadata
export function hasHydrationMetadata(prefs: any): prefs is HydrationMetadata {
  return prefs && typeof prefs === 'object' && 
    (prefs._serverHydrationTime !== undefined || 
     prefs._version !== undefined ||
     prefs._lastUpdated !== undefined);
}

// Helper to safely extract hydration info from any preference object
export function getHydrationInfo(prefs: any): {
  serverTime?: number;
  version: number;
  lastUpdated?: number;
  hasClientUpdate?: boolean;
} {
  return {
    serverTime: prefs?._serverHydrationTime,
    version: prefs?._version || 1,
    lastUpdated: prefs?._lastUpdated,
    hasClientUpdate: prefs?._clientUpdate === true,
  };
}
