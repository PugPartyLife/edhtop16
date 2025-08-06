import {
  pages_CommandersQuery,
} from '#genfiles/queries/pages_CommandersQuery.graphql';
import {pages_topCommanders$key} from '#genfiles/queries/pages_topCommanders.graphql';
import {pages_TopCommandersCard$key} from '#genfiles/queries/pages_TopCommandersCard.graphql';
import {TopCommandersQuery} from '#genfiles/queries/TopCommandersQuery.graphql';
import {Link, useNavigation, useRouteParams} from '#genfiles/river/router';
import RectangleStackIcon from '@heroicons/react/24/solid/RectangleStackIcon';
import TableCellsIcon from '@heroicons/react/24/solid/TableCellsIcon';
import {useSeoMeta} from '@unhead/react';
import cn from 'classnames';
import React, {
  PropsWithChildren,
  useCallback,
  useMemo,
  useState,
  useEffect,
  startTransition,
  useRef,
} from 'react';
import {
  EntryPointComponent,
  graphql,
  useFragment,
  usePaginationFragment,
  usePreloadedQuery,
} from 'react-relay/hooks';
import {
  useCommanderPreferences,
  setRefetchCallback,
  clearRefetchCallback,
  CommanderPreferences
} from '../lib/client/cookies';
import {ColorIdentity} from '../assets/icons/colors';
import {Card} from '../components/card';
import {ColorSelection} from '../components/color_selection';
import {Footer} from '../components/footer';
import {LoadMoreButton} from '../components/load_more';
import {Navigation} from '../components/navigation';
import {NumberInputDropdown} from '../components/number_input_dropdown';
import {Dropdown} from '../components/dropdown';
import {Select} from '../components/select';
import {formatPercent} from '../lib/client/format';

function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number,
): T {
  let timeoutId: NodeJS.Timeout;
  return ((...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  }) as T;
}

const TopCommandersCard = React.memo(function TopCommandersCard({
  display = 'card',
  secondaryStatistic,
  ...props
}: {
  display?: 'table' | 'card';
  secondaryStatistic: 'topCuts' | 'count';
  commander: pages_TopCommandersCard$key;
}) {
  const commander = useFragment(
    graphql`
      fragment pages_TopCommandersCard on Commander {
        name
        colorId
        breakdownUrl
        stats {
          conversionRate
          topCuts
          count
          metaShare
          topCutBias
        }
        cards {
          imageUrls
        }
      }
    `,
    props.commander,
  );

  console.log('🃏 Card Debug:', {
    commander: commander,
    commanderName: commander.name,
    secondaryStatistic,
  });

  const commanderStats = useMemo(() => {
    console.log('🃏 Card Stats Debug:', {
      commanderName: commander.name,
      secondaryStatistic,
      stats: commander.stats
    });

    console.log('🔍 Raw stats from GraphQL:', commander.stats);
    console.log('🔍 Count should be 27 but is:', commander.stats.count);
    console.log('🔍 Meta share should change but is:', commander.stats.metaShare);
    
    const stats: string[] = [];

    if (secondaryStatistic === 'count') {
      stats.push(
        `Meta Share: ${formatPercent(commander.stats.metaShare)}`,
        `Entries: ${commander.stats.count}`,
      );
    } else if (secondaryStatistic === 'topCuts') {
      stats.push(
        `Conversion Rate: ${formatPercent(commander.stats.conversionRate)}`,
        `Top Cuts: ${commander.stats.topCuts}`,
      );
    }

    console.log('🃏 Final stats string:', stats.join(' / '));
    return stats.join(' / ');
  }, [
    commander.stats.metaShare,
    commander.stats.count,
    commander.stats.conversionRate,
    commander.stats.topCuts,
    secondaryStatistic
  ]);

  // Memoize image data to prevent recalculation
  const images = useMemo(() => 
    commander.cards
      .flatMap((c) => c.imageUrls)
      .map((img) => ({
        src: img,
        alt: `${commander.name} card art`,
      }))
  , [commander.cards, commander.name]);

  console.log(commanderStats);

  if (display === 'table') {
    return (
      <div className="grid w-full grid-cols-[130px_1fr] items-center gap-x-2 overflow-x-hidden rounded-sm bg-[#312d5a]/50 p-4 text-white shadow-md lg:grid-cols-[130px_minmax(350px,1fr)_100px_100px_100px_100px]">
        <div>
          <ColorIdentity identity={commander.colorId} />
        </div>

        <Link
          href={commander.breakdownUrl}
          className="font-title mb-2 text-xl underline lg:mb-0 lg:font-sans lg:text-base"
        >
          {commander.name}
        </Link>

        <div className="text-sm opacity-75 lg:hidden">Entries:</div>
        <div className="text-sm">{commander.stats.count}</div>
        <div className="text-sm opacity-75 lg:hidden">Meta Share:</div>
        <div className="text-sm">
          {formatPercent(commander.stats.metaShare)}
        </div>
        <div className="text-sm opacity-75 lg:hidden">Top Cuts:</div>
        <div className="text-sm">{commander.stats.topCuts}</div>
        <div className="text-sm opacity-75 lg:hidden">Conversion Rate:</div>
        <div className="text-sm">
          {formatPercent(commander.stats.conversionRate)}
        </div>
      </div>
    );
  }
  
  return (
    <Card
      bottomText={commanderStats}
      images={images}
    >
      <div className="flex h-32 flex-col space-y-2">
        <Link
          href={commander.breakdownUrl}
          className="text-xl font-bold underline decoration-transparent transition-colors group-hover:decoration-inherit"
        >
          {commander.name}
        </Link>

        <ColorIdentity identity={commander.colorId} />
      </div>
    </Card>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.display === nextProps.display &&
    prevProps.secondaryStatistic === nextProps.secondaryStatistic &&
    prevProps.commander === nextProps.commander
  );
});

// New optimized FilterControls component
const FilterControls = React.memo(function FilterControls({
  currentSortBy,
  currentTimePeriod,
  colorId,
  localMinEntries,
  localEventSize,
  onSortByChange,
  onTimePeriodChange,
  onColorChange,
  onMinEntriesChange,
  onEventSizeChange,
  onMinEntriesSelect,
  onEventSizeSelect,
  onKeyDown,
}: {
  currentSortBy: 'CONVERSION' | 'POPULARITY';
  currentTimePeriod: 'ONE_MONTH' | 'THREE_MONTHS' | 'SIX_MONTHS' | 'ONE_YEAR' | 'ALL_TIME' | 'POST_BAN';
  colorId: string;
  localMinEntries: string;
  localEventSize: string;
  onSortByChange: (value: 'CONVERSION' | 'POPULARITY') => void;
  onTimePeriodChange: (value: 'ONE_MONTH' | 'THREE_MONTHS' | 'SIX_MONTHS' | 'ONE_YEAR' | 'ALL_TIME' | 'POST_BAN') => void;
  onColorChange: (value: string | null) => void;
  onMinEntriesChange: (value: string) => void;
  onEventSizeChange: (value: string) => void;
  onMinEntriesSelect: (value: number | null) => void;
  onEventSizeSelect: (value: number | null) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  // Memoize dropdown options OUTSIDE the shell component
  const sortByOptions = useMemo(() => [
    { value: 'CONVERSION' as const, label: 'Top Performing' },
    { value: 'POPULARITY' as const, label: 'Most Popular' },
  ], []);

  const timePeriodOptions = useMemo(() => [
    {value: 'ONE_MONTH' as const, label: '1 Month'},
    {value: 'THREE_MONTHS' as const, label: '3 Months'},
    {value: 'SIX_MONTHS' as const, label: '6 Months'},
    {value: 'ONE_YEAR' as const, label: '1 Year'},
    {value: 'ALL_TIME' as const, label: 'All Time'},
    {value: 'POST_BAN' as const, label: 'Post Ban'},
  ], []);

  const minEntriesOptions = useMemo(() => [
    {value: null, label: 'All Entries'},
    {value: 20, label: '20+ Entries'},
    {value: 40, label: '40+ Entries'},
    {value: 60, label: '60+ Entries'},
    {value: 100, label: '100+ Entries'},
  ], []);

  const eventSizeOptions = useMemo(() => [
    {value: null, label: 'All Tournaments'},
    {value: 30, label: '30+ - Medium Events'},
    {value: 60, label: '60+ - Large Events'},
    {value: 100, label: '100+ - Major Events'},
  ], []);

  const timePeriodLabel = useMemo(() => {
    switch(currentTimePeriod) {
      case 'ONE_MONTH': return '1 Month';
      case 'THREE_MONTHS': return '3 Months';
      case 'SIX_MONTHS': return '6 Months';
      case 'ONE_YEAR': return '1 Year';
      case 'ALL_TIME': return 'All Time';
      case 'POST_BAN': return 'Post Ban';
      default: return '1 Month';
    }
  }, [currentTimePeriod]);

  return (
    <div className="mb-8 flex flex-col items-start space-y-4 lg:flex-row lg:items-end lg:space-y-0">
      <div className="flex-1">
        <ColorSelection selected={colorId} onChange={onColorChange} />
      </div>

      <div className="flex flex-wrap justify-center gap-x-4 gap-y-4 lg:flex-nowrap lg:justify-end">
        <div className="relative flex flex-col">
          <Dropdown
            id="commanders-sort-by"
            label="Sort By"
            value={currentSortBy === 'POPULARITY' ? 'Most Popular' : 'Top Performing'}
            options={sortByOptions}
            onSelect={onSortByChange}
          />
        </div>

        <div className="relative flex flex-col">
          <Dropdown
            id="commanders-time-period"
            label="Time Period"
            value={timePeriodLabel}
            options={timePeriodOptions}
            onSelect={onTimePeriodChange}
          />
        </div>

        <div className="relative flex flex-col">
          <NumberInputDropdown
            id="commanders-min-entries"
            label="Commander Entries"
            value={localMinEntries || ''}
            placeholder="Commander Entries"
            min="1"
            dropdownClassName="min-entries-dropdown"
            options={minEntriesOptions}
            onChange={onMinEntriesChange}
            onSelect={onMinEntriesSelect}
            onKeyDown={onKeyDown}
          />
        </div>

        <div className="relative flex flex-col">
          <NumberInputDropdown
            id="commanders-event-size"
            label="Event Size"
            value={localEventSize || ''}
            placeholder="Event Size"
            min="1"
            dropdownClassName="event-size-dropdown"
            options={eventSizeOptions}
            onChange={onEventSizeChange}
            onSelect={onEventSizeSelect}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
    </div>
  );
});

// New optimized PageHeader component
const PageHeader = React.memo(function PageHeader({
  display,
  onDisplayToggle,
}: {
  display: 'card' | 'table';
  onDisplayToggle: () => void;
}) {
  return (
    <div className="flex w-full items-baseline gap-4">
      <h1 className="font-title mb-8 flex-1 text-5xl font-extrabold text-white lg:mb-0">
        cEDH Metagame Breakdown
      </h1>

      <button className="cursor-pointer" onClick={onDisplayToggle}>
        {display === 'card' ? (
          <TableCellsIcon className="h-6 w-6 text-white" />
        ) : (
          <RectangleStackIcon className="h-6 w-6 text-white" />
        )}
      </button>
    </div>
  );
});

// Optimized CommandersPageShell
const CommandersPageShell = React.memo(function CommandersPageShell({
  sortBy,
  timePeriod,
  colorId,
  minEntries,
  minTournamentSize,
  display, 
  updatePreference, 
  preferences, 
  children,
}: PropsWithChildren<{
  colorId: string;
  minEntries?: number | null;
  minTournamentSize?: number | null;
  sortBy: 'CONVERSION' | 'POPULARITY';
  timePeriod: 'ONE_MONTH' | 'THREE_MONTHS' | 'SIX_MONTHS' | 'ONE_YEAR' | 'ALL_TIME' | 'POST_BAN';
  display: 'card' | 'table'; 
  updatePreference: (key: keyof CommanderPreferences, value: any) => void; 
  preferences: CommanderPreferences; 
}>) {
  useSeoMeta({
    title: 'cEDH Commanders',
    description: 'Discover top performing commanders in cEDH!',
  });

  // Move all state to the top
  const [localMinEntries, setLocalMinEntries] = useState(
    minEntries?.toString() || '',
  );
  const [localEventSize, setLocalEventSize] = useState(
    minTournamentSize && minTournamentSize > 0
      ? minTournamentSize.toString()
      : '',
  );

  const currentSortBy = preferences.sortBy || sortBy;
  const currentTimePeriod = preferences.timePeriod || timePeriod;

  // Batch all effects together
  useEffect(() => {
    setLocalMinEntries(minEntries?.toString() || '');
    setLocalEventSize(
      minTournamentSize && minTournamentSize > 0
        ? minTournamentSize.toString()
        : '',
    );
  }, [minEntries, minTournamentSize]);

  // Optimize debounced functions - use useRef instead of useMemo to prevent recreation
  const debouncedMinEntriesUpdate = useRef(
    debounce((value: string) => {
      if (value === '') {
        updatePreference('minEntries', null);
      } else {
        const numValue = parseInt(value, 10);
        if (!isNaN(numValue) && numValue >= 1) {
          updatePreference('minEntries', numValue);
        }
      }
    }, 300)
  ).current;

  const debouncedEventSizeUpdate = useRef(
    debounce((value: string) => {
      if (value === '') {
        updatePreference('minTournamentSize', null);
      } else {
        const numValue = parseInt(value, 10);
        if (!isNaN(numValue) && numValue >= 1) {
          updatePreference('minTournamentSize', numValue);
        }
      }
    }, 300)
  ).current;

  // Batch all callbacks together into a single memoized object
  const callbacks = useMemo(() => ({
    handleKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Go') {
        (e.target as HTMLInputElement).blur();
      }
    },
    handleColorChange: (value: string | null) => updatePreference('colorId', value),
    handleSortByChange: (value: 'CONVERSION' | 'POPULARITY') => updatePreference('sortBy', value),
    handleTimePeriodChange: (value: 'ONE_MONTH' | 'THREE_MONTHS' | 'SIX_MONTHS' | 'ONE_YEAR' | 'ALL_TIME' | 'POST_BAN') => updatePreference('timePeriod', value),
    handleDisplayToggle: () => updatePreference('display', display === 'table' ? 'card' : 'table'),
    handleEventSizeChange: (value: string) => {
      setLocalEventSize(value);
      debouncedEventSizeUpdate(value);
    },
    handleMinEntriesChange: (value: string) => {
      setLocalMinEntries(value);
      debouncedMinEntriesUpdate(value);
    },
    handleMinEntriesSelect: (value: number | null) => {
      const stringValue = value?.toString() || '';
      startTransition(() => setLocalMinEntries(stringValue));
      updatePreference('minEntries', value);
    },
    handleEventSizeSelect: (value: number | null) => {
      const stringValue = value?.toString() || '';
      startTransition(() => setLocalEventSize(stringValue));
      updatePreference('minTournamentSize', value);
    },
  }), [updatePreference, display, debouncedMinEntriesUpdate, debouncedEventSizeUpdate]);

  return (
    <>
      <Navigation />
      <div className="mx-auto mt-8 w-full max-w-(--breakpoint-xl) px-8">
        <PageHeader 
          display={display} 
          onDisplayToggle={callbacks.handleDisplayToggle} 
        />
        
        <FilterControls
          currentSortBy={currentSortBy}
          currentTimePeriod={currentTimePeriod}
          colorId={colorId}
          localMinEntries={localMinEntries}
          localEventSize={localEventSize}
          onSortByChange={callbacks.handleSortByChange}
          onTimePeriodChange={callbacks.handleTimePeriodChange}
          onColorChange={callbacks.handleColorChange}
          onMinEntriesChange={callbacks.handleMinEntriesChange}
          onEventSizeChange={callbacks.handleEventSizeChange}
          onMinEntriesSelect={callbacks.handleMinEntriesSelect}
          onEventSizeSelect={callbacks.handleEventSizeSelect}
          onKeyDown={callbacks.handleKeyDown}
        />

        {children}
      </div>
    </>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.sortBy === nextProps.sortBy &&
    prevProps.timePeriod === nextProps.timePeriod &&
    prevProps.colorId === nextProps.colorId &&
    prevProps.minEntries === nextProps.minEntries &&
    prevProps.minTournamentSize === nextProps.minTournamentSize &&
    prevProps.display === nextProps.display &&
    prevProps.children === nextProps.children
  );
});

/** @resource m#index */
export const CommandersPage: EntryPointComponent<
  {commandersQueryRef: pages_CommandersQuery},
  {}
> = ({queries}) => {
  const {preferences, updatePreference, isHydrated} = useCommanderPreferences();
  
  const effectivePreferences = useMemo(() => {
    if (!isHydrated) {
      return {
        sortBy: preferences.sortBy || 'CONVERSION',
        timePeriod: preferences.timePeriod || 'ONE_MONTH',
        display: preferences.display || 'card',
        minEntries: preferences.minEntries || 0,
        minTournamentSize: preferences.minTournamentSize || 0,
        colorId: preferences.colorId || '',
      };
    }
    return preferences;
  }, [preferences, isHydrated]);

  console.log('🎭 [RENDER] CommandersPage rendering with:', {
    preferences,
    effectivePreferences,
    isHydrated,
    timestamp: new Date().toISOString()
  });
  
  const query = usePreloadedQuery(
    graphql`
      query pages_CommandersQuery @preloadable {
        ...pages_topCommanders
      }
    `,
    queries.commandersQueryRef,
  );

const {data, loadNext, isLoadingNext, hasNext, refetch} = usePaginationFragment<TopCommandersQuery, pages_topCommanders$key>(
  graphql`
    fragment pages_topCommanders on Query
    @argumentDefinitions(
      cursor: {type: "String"}
      count: {type: "Int", defaultValue: 20}
    )
    @refetchable(queryName: "TopCommandersQuery") {
      commanders(
        first: $count
        after: $cursor
      ) @connection(key: "pages__commanders") {
        edges {
          node {
            id
            ...pages_TopCommandersCard
          }
        }
      }
    }
  `,
  query,
);

  console.log('🔍 Fragment data:', data);
  console.log('🔍 First commander node:', data.commanders.edges[0]?.node);

  const display = useMemo(() => {
    const result = isHydrated ? (effectivePreferences.display || 'card') : 'card';
    console.log('🎭 [DISPLAY] Display calculated:', {
      isHydrated,
      prefDisplay: effectivePreferences.display,
      result
    });
    return result;
  }, [isHydrated, effectivePreferences.display]);

  // Memoize the refetch callback to prevent recreating on every render
  const handleRefetch = useCallback((currentPrefs?: CommanderPreferences) => {
    console.log('🔄 REFETCH TRIGGERED FROM CALLBACK');
    startTransition(() => {
      refetch({}, {
        fetchPolicy: 'network-only',
      });
    });
  }, [refetch]);

  // Memoize the load more handler
  const handleLoadMore = useCallback((count: number) => {
    startTransition(() => {
      loadNext(count);
    });
  }, [loadNext]);

  useEffect(() => {
    setRefetchCallback(handleRefetch);
    return () => {
      clearRefetchCallback();
    };
  }, [handleRefetch]);

  useEffect(() => {
    if (isHydrated) {
      const serverSortBy = 'CONVERSION';
      const clientSortBy = effectivePreferences.sortBy;
      
      if (clientSortBy !== serverSortBy) {
        console.log('🔄 ABOUT TO REFETCH - Client preferences differ from server');
        console.log('🔄 Server used:', serverSortBy);
        console.log('🔄 Client wants:', clientSortBy);
        
        startTransition(() => {
          console.log('🔄 CALLING REFETCH NOW');
          
          refetch({}, {
            fetchPolicy: 'network-only',
          });
        });
      }
    }
  }, [isHydrated, effectivePreferences.sortBy, effectivePreferences.timePeriod, refetch]);

  // Memoize the debounced logging function
  const logData = useMemo(
    () => debounce((data) => {
      console.log('📊 === DATA CHANGED ===');
      console.log('📊 Commander count:', data?.commanders?.edges?.length);
      console.log('📊 Timestamp:', new Date().toISOString());
      console.log('📊 === END DATA CHANGE ===');
    }, 200),
    []
  );

  useEffect(() => {
    logData(data);
  }, [data, logData]);

  const secondaryStatistic = useMemo(() => {
    switch (effectivePreferences.sortBy) {
      case 'CONVERSION':
        return 'topCuts'; // Show conversion stats when sorting by conversion
      case 'POPULARITY':
      default:
        return 'count';   // Show popularity stats when sorting by popularity
    }
  }, [effectivePreferences.sortBy]);

  // Memoize shell props to prevent unnecessary re-renders
  const shellProps = useMemo(() => ({
    sortBy: effectivePreferences.sortBy || 'CONVERSION',
    timePeriod: effectivePreferences.timePeriod || 'ONE_MONTH',
    colorId: effectivePreferences.colorId || '',
    minEntries: effectivePreferences.minEntries || null,
    minTournamentSize: effectivePreferences.minTournamentSize || null,
    display,
    updatePreference,
    preferences: effectivePreferences,
  }), [
    effectivePreferences.sortBy,
    effectivePreferences.timePeriod,
    effectivePreferences.colorId,
    effectivePreferences.minEntries,
    effectivePreferences.minTournamentSize,
    display,
    updatePreference,
    effectivePreferences,
  ]);

  return (
    <CommandersPageShell {...shellProps}>
      <div
        className={cn(
          'mx-auto grid w-full pb-4',
          display === 'table'
            ? 'w-full grid-cols-1 gap-2'
            : 'w-fit gap-4 md:grid-cols-2 xl:grid-cols-3',
        )}
      >
        {display === 'table' && (
          <div className="sticky top-[68px] hidden w-full grid-cols-[130px_minmax(350px,1fr)_100px_100px_100px_100px] items-center gap-x-2 overflow-x-hidden bg-[#514f86] p-4 text-sm text-white lg:grid">
            <div>Color</div>
            <div>Commander</div>
            <div>Entries</div>
            <div>Meta %</div>
            <div>Top Cuts</div>
            <div>Cnvr. %</div>
          </div>
        )}

        {data.commanders.edges.map(({node}) => (
          <TopCommandersCard
            key={node.id}
            display={display}
            commander={node}
            secondaryStatistic={secondaryStatistic}
          />
        ))}
      </div>

      <LoadMoreButton
        hasNext={hasNext}
        isLoadingNext={isLoadingNext}
        loadNext={handleLoadMore}
      />

      <Footer />
    </CommandersPageShell>
  );
};