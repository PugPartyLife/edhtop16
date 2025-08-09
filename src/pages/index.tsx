import {pages_CommandersQuery} from '#genfiles/queries/pages_CommandersQuery.graphql';
import {pages_topCommanders$key} from '#genfiles/queries/pages_topCommanders.graphql';
import {pages_TopCommandersCard$key} from '#genfiles/queries/pages_TopCommandersCard.graphql';
import {TopCommandersQuery} from '#genfiles/queries/TopCommandersQuery.graphql';
import {Link} from '#genfiles/river/router';
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
  usePreferences,
  setRefetchCallback,
  clearRefetchCallback,
  type PreferencesMap,
  DEFAULT_PREFERENCES,
} from '../lib/client/cookies';
import {ColorIdentity} from '../assets/icons/colors';
import {Card} from '../components/card';
import {ColorSelection} from '../components/color_selection';
import {Footer} from '../components/footer';
import {LoadMoreButton} from '../components/load_more';
import {Navigation} from '../components/navigation';
import {NumberInputDropdown} from '../components/number_input_dropdown';
import {Dropdown} from '../components/dropdown';
import {formatPercent} from '../lib/client/format';

const createDebouncer = <T extends (...args: any[]) => any>(
  func: T,
  delay: number,
): T => {
  let timeoutId: NodeJS.Timeout;
  return ((...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  }) as T;
};

const TIME_PERIOD_LABELS = {
  ONE_MONTH: '1 Month',
  THREE_MONTHS: '3 Months',
  SIX_MONTHS: '6 Months',
  ONE_YEAR: '1 Year',
  ALL_TIME: 'All Time',
  POST_BAN: 'Post Ban',
} as const;

const SORT_BY_OPTIONS = [
  {value: 'CONVERSION' as const, label: 'Top Performing'},
  {value: 'POPULARITY' as const, label: 'Most Popular'},
];

const TIME_PERIOD_OPTIONS = [
  {value: 'ONE_MONTH' as const, label: '1 Month'},
  {value: 'THREE_MONTHS' as const, label: '3 Months'},
  {value: 'SIX_MONTHS' as const, label: '6 Months'},
  {value: 'ONE_YEAR' as const, label: '1 Year'},
  {value: 'ALL_TIME' as const, label: 'All Time'},
  {value: 'POST_BAN' as const, label: 'Post Ban'},
];

const MIN_ENTRIES_OPTIONS = [
  {value: null, label: 'All Entries'},
  {value: 20, label: '20+ Entries'},
  {value: 40, label: '40+ Entries'},
  {value: 60, label: '60+ Entries'},
  {value: 100, label: '100+ Entries'},
];

const EVENT_SIZE_OPTIONS = [
  {value: null, label: 'All Tournaments'},
  {value: 30, label: '30+ - Medium Events'},
  {value: 60, label: '60+ - Large Events'},
  {value: 100, label: '100+ - Major Events'},
];

const TopCommandersCard = React.memo(function TopCommandersCard({
  display = 'card',
  secondaryStatistic,
  commander: commanderRef,
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
        }
        cards {
          imageUrls
        }
      }
    `,
    commanderRef,
  );

  const commanderStats = useMemo(() => {
    if (secondaryStatistic === 'count') {
      return `Meta Share: ${formatPercent(commander.stats.metaShare)} / Entries: ${commander.stats.count}`;
    }
    return `Conversion Rate: ${formatPercent(commander.stats.conversionRate)} / Top Cuts: ${commander.stats.topCuts}`;
  }, [commander.stats, secondaryStatistic]);

  const images = useMemo(
    () =>
      commander.cards
        .flatMap((c) => c.imageUrls)
        .map((img) => ({
          src: img,
          alt: `${commander.name} card art`,
        })),
    [commander.cards, commander.name],
  );

  if (display === 'table') {
    return (
      <div className="grid w-full grid-cols-[130px_1fr] items-center gap-x-2 overflow-x-hidden rounded-sm bg-[#312d5a]/50 p-4 text-white shadow-md lg:grid-cols-[130px_minmax(350px,1fr)_100px_100px_100px_100px]">
        <ColorIdentity identity={commander.colorId} />
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
    <Card bottomText={commanderStats} images={images}>
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
});

function useOptimizedInputHandlers(
  updatePreference: (
    key: keyof PreferencesMap['commanders'],
    value: number | null,
  ) => void,
) {
  return useMemo(() => {
    const debouncedMinEntries = createDebouncer((value: string) => {
      const numValue = value === '' ? null : parseInt(value, 10);
      if (numValue === null || (!isNaN(numValue) && numValue >= 1)) {
        updatePreference(
          'minEntries' as keyof PreferencesMap['commanders'],
          numValue,
        );
      }
    }, 250);

    const debouncedEventSize = createDebouncer((value: string) => {
      const numValue = value === '' ? null : parseInt(value, 10);
      if (numValue === null || (!isNaN(numValue) && numValue >= 1)) {
        updatePreference(
          'minTournamentSize' as keyof PreferencesMap['commanders'],
          numValue,
        );
      }
    }, 250);

    const handleMinEntriesChange = (
      value: string,
      setLocal: (value: string) => void,
    ) => {
      setLocal(value);
      debouncedMinEntries(value);
    };

    const handleMinEntriesSelect = (
      value: number | null,
      setLocal: (value: string) => void,
    ) => {
      const stringValue = value?.toString() || '';
      startTransition(() => setLocal(stringValue));
      updatePreference(
        'minEntries' as keyof PreferencesMap['commanders'],
        value,
      );
    };

    const handleEventSizeChange = (
      value: string,
      setLocal: (value: string) => void,
    ) => {
      setLocal(value);
      debouncedEventSize(value);
    };

    const handleEventSizeSelect = (
      value: number | null,
      setLocal: (value: string) => void,
    ) => {
      const stringValue = value?.toString() || '';
      startTransition(() => setLocal(stringValue));
      updatePreference(
        'minTournamentSize' as keyof PreferencesMap['commanders'],
        value,
      );
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Go') {
        (e.target as HTMLInputElement).blur();
      }
    };

    return {
      handleMinEntriesChange,
      handleMinEntriesSelect,
      handleEventSizeChange,
      handleEventSizeSelect,
      handleKeyDown,
    };
  }, [updatePreference]);
}

function CommandersPageShell({
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
  timePeriod: keyof typeof TIME_PERIOD_LABELS;
  display: 'card' | 'table';
  updatePreference: (
    key: keyof PreferencesMap['commanders'],
    value: any,
  ) => void;
  preferences: PreferencesMap['commanders'];
}>) {
  useSeoMeta({
    title: 'cEDH Commanders',
    description: 'Discover top performing commanders in cEDH!',
  });

  const [localMinEntries, setLocalMinEntries] = useState(
    () => minEntries?.toString() || '',
  );
  const [localEventSize, setLocalEventSize] = useState(() =>
    minTournamentSize && minTournamentSize > 0
      ? minTournamentSize.toString()
      : '',
  );

  const inputHandlers = useOptimizedInputHandlers(updatePreference);

  useEffect(() => {
    setLocalMinEntries(minEntries?.toString() || '');
  }, [minEntries]);

  useEffect(() => {
    setLocalEventSize(
      minTournamentSize && minTournamentSize > 0
        ? minTournamentSize.toString()
        : '',
    );
  }, [minTournamentSize]);

  const handleDisplayToggle = useCallback(() => {
    updatePreference(
      'display' as keyof PreferencesMap['commanders'],
      display === 'table' ? 'card' : 'table',
    );
  }, [updatePreference, display]);

  const handleSortByChange = useCallback(
    (value: 'CONVERSION' | 'POPULARITY') => {
      updatePreference('sortBy' as keyof PreferencesMap['commanders'], value);
    },
    [updatePreference],
  );

  const handleTimePeriodChange = useCallback(
    (value: keyof typeof TIME_PERIOD_LABELS) => {
      updatePreference(
        'timePeriod' as keyof PreferencesMap['commanders'],
        value,
      );
    },
    [updatePreference],
  );

  const handleColorChange = useCallback(
    (value: string) => {
      updatePreference('colorId' as keyof PreferencesMap['commanders'], value);
    },
    [updatePreference],
  );

  const currentSortByLabel = useMemo(
    () =>
      preferences?.sortBy === 'POPULARITY' ? 'Most Popular' : 'Top Performing',
    [preferences?.sortBy],
  );

  const currentTimePeriodLabel = useMemo(
    () =>
      TIME_PERIOD_LABELS[preferences?.timePeriod || timePeriod] || '1 Month',
    [preferences?.timePeriod, timePeriod],
  );

  return (
    <>
      <Navigation />
      <div className="mx-auto mt-8 w-full max-w-(--breakpoint-xl) px-8">
        {/* Header */}
        <div className="flex w-full items-baseline gap-4">
          <h1 className="font-title mb-8 flex-1 text-5xl font-extrabold text-white lg:mb-0">
            cEDH Metagame Breakdown
          </h1>
          <button
            className="cursor-pointer"
            onClick={handleDisplayToggle}
            aria-label={`Switch to ${display === 'table' ? 'card' : 'table'} view`}
          >
            {display === 'card' ? (
              <TableCellsIcon className="h-6 w-6 text-white" />
            ) : (
              <RectangleStackIcon className="h-6 w-6 text-white" />
            )}
          </button>
        </div>

        {/* Filters */}
        <div className="mb-8 flex flex-col items-start space-y-4 lg:flex-row lg:items-end lg:space-y-0">
          <div className="flex-1">
            <ColorSelection selected={colorId} onChange={handleColorChange} />
          </div>

          <div className="flex flex-wrap justify-center gap-x-4 gap-y-4 lg:flex-nowrap lg:justify-end">
            <div className="relative flex flex-col">
              <Dropdown
                id="commanders-sort-by"
                label="Sort By"
                value={currentSortByLabel}
                options={SORT_BY_OPTIONS}
                onSelect={handleSortByChange}
              />
            </div>
            <div className="relative flex flex-col">
              <Dropdown
                id="commanders-time-period"
                label="Time Period"
                value={currentTimePeriodLabel}
                options={TIME_PERIOD_OPTIONS}
                onSelect={handleTimePeriodChange}
              />
            </div>
            <div className="relative flex flex-col">
              <NumberInputDropdown
                id="commanders-min-entries"
                label="Commander Entries"
                value={localMinEntries}
                placeholder="Commander Entries"
                min="1"
                dropdownClassName="min-entries-dropdown"
                options={MIN_ENTRIES_OPTIONS}
                onChange={(value) =>
                  inputHandlers.handleMinEntriesChange(
                    value,
                    setLocalMinEntries,
                  )
                }
                onSelect={(value) =>
                  inputHandlers.handleMinEntriesSelect(
                    value,
                    setLocalMinEntries,
                  )
                }
                onKeyDown={inputHandlers.handleKeyDown}
              />
            </div>
            <div className="relative flex flex-col">
              <NumberInputDropdown
                id="commanders-event-size"
                label="Event Size"
                value={localEventSize}
                placeholder="Event Size"
                min="1"
                dropdownClassName="event-size-dropdown"
                options={EVENT_SIZE_OPTIONS}
                onChange={(value) =>
                  inputHandlers.handleEventSizeChange(value, setLocalEventSize)
                }
                onSelect={(value) =>
                  inputHandlers.handleEventSizeSelect(value, setLocalEventSize)
                }
                onKeyDown={inputHandlers.handleKeyDown}
              />
            </div>
          </div>
        </div>

        {children}
      </div>
    </>
  );
}

/** @resource m#index */
export const CommandersPage: EntryPointComponent<
  {commandersQueryRef: pages_CommandersQuery},
  {}
> = ({queries}) => {
  const {preferences, updatePreference, isHydrated} = usePreferences(
    'commanders',
    DEFAULT_PREFERENCES.commanders!,
  );

  const serverPreferences = useMemo(() => {
    if (
      typeof window !== 'undefined' &&
      (window as any).__SERVER_PREFERENCES__
    ) {
      return (window as any).__SERVER_PREFERENCES__;
    }
    return null;
  }, []);

  const query = usePreloadedQuery(
    graphql`
      query pages_CommandersQuery @preloadable {
        ...pages_topCommanders
      }
    `,
    queries.commandersQueryRef,
  );

  const {data, loadNext, isLoadingNext, hasNext, refetch} =
    usePaginationFragment<TopCommandersQuery, pages_topCommanders$key>(
      graphql`
        fragment pages_topCommanders on Query
        @argumentDefinitions(
          cursor: {type: "String"}
          count: {type: "Int", defaultValue: 20}
        )
        @refetchable(queryName: "TopCommandersQuery") {
          commanders(first: $count, after: $cursor)
            @connection(key: "pages__commanders") {
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

  const currentPreferences = useMemo(
    () => ({
      sortBy: preferences?.sortBy || ('CONVERSION' as const),
      timePeriod: preferences?.timePeriod || ('ONE_MONTH' as const),
      colorId: preferences?.colorId || '',
      minEntries: preferences?.minEntries || null,
      minTournamentSize: preferences?.minTournamentSize || null,
      display: preferences?.display || ('card' as const),
    }),
    [preferences],
  );

  const secondaryStatistic = useMemo(
    () =>
      currentPreferences.sortBy === 'CONVERSION'
        ? ('topCuts' as const)
        : ('count' as const),
    [currentPreferences.sortBy],
  );

  const handleRefetch = useCallback(() => {
    console.log('🔄 [COMMANDERS] Refetch triggered by preferences change');
    startTransition(() => {
      refetch({}, {fetchPolicy: 'network-only'});
    });
  }, [refetch]);

  const handleLoadMore = useCallback(
    (count: number) => {
      startTransition(() => {
        loadNext(count);
      });
    },
    [loadNext],
  );

  const hasRefetchedRef = useRef(false);

  useEffect(() => {
    setRefetchCallback(handleRefetch);
    return clearRefetchCallback;
  }, [handleRefetch]);

  useEffect(() => {
    if (isHydrated && !hasRefetchedRef.current) {
      hasRefetchedRef.current = true;

      const actualServerPrefs =
        serverPreferences || DEFAULT_PREFERENCES.commanders;
      const prefsMatch =
        JSON.stringify(preferences) === JSON.stringify(actualServerPrefs);

      console.log('🍪 [COMMANDERS] Hydration complete:', {
        clientPrefs: preferences,
        serverPrefs: actualServerPrefs,
        needsRefetch: !prefsMatch,
      });
    }
  }, [isHydrated, preferences, serverPreferences]);

  const gridClasses = useMemo(
    () =>
      cn(
        'mx-auto grid w-full pb-4',
        currentPreferences.display === 'table'
          ? 'w-full grid-cols-1 gap-2'
          : 'w-fit gap-4 md:grid-cols-2 xl:grid-cols-3',
      ),
    [currentPreferences.display],
  );

  const tableHeader = useMemo(() => {
    if (currentPreferences.display !== 'table') return null;

    return (
      <div className="sticky top-[68px] hidden w-full grid-cols-[130px_minmax(350px,1fr)_100px_100px_100px_100px] items-center gap-x-2 overflow-x-hidden bg-[#514f86] p-4 text-sm text-white lg:grid">
        <div>Color</div>
        <div>Commander</div>
        <div>Entries</div>
        <div>Meta %</div>
        <div>Top Cuts</div>
        <div>Cnvr. %</div>
      </div>
    );
  }, [currentPreferences.display]);

  return (
    <CommandersPageShell
      sortBy={currentPreferences.sortBy}
      timePeriod={currentPreferences.timePeriod}
      colorId={currentPreferences.colorId}
      minEntries={currentPreferences.minEntries}
      minTournamentSize={currentPreferences.minTournamentSize}
      display={currentPreferences.display}
      updatePreference={updatePreference}
      preferences={preferences}
    >
      <div className={gridClasses}>
        {tableHeader}
        {data.commanders.edges.map(({node}) => (
          <TopCommandersCard
            key={node.id}
            display={currentPreferences.display}
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
