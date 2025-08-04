import {
  pages_CommandersQuery,
  CommandersSortBy,
  TimePeriod
} from '#genfiles/queries/pages_CommandersQuery.graphql';
import {pages_topCommanders$key} from '#genfiles/queries/pages_topCommanders.graphql';
import {pages_TopCommandersCard$key} from '#genfiles/queries/pages_TopCommandersCard.graphql';
import {TopCommandersQuery} from '#genfiles/queries/TopCommandersQuery.graphql';
import {Link, useNavigation, useRouteParams} from '#genfiles/river/router';
import RectangleStackIcon from '@heroicons/react/24/solid/RectangleStackIcon';
import TableCellsIcon from '@heroicons/react/24/solid/TableCellsIcon';
import {useSeoMeta} from '@unhead/react';
import cn from 'classnames';
import {
  PropsWithChildren,
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef
} from 'react';
import {
  EntryPointComponent,
  graphql,
  useFragment,
  usePaginationFragment,
  usePreloadedQuery,
} from 'react-relay/hooks';
import { useCommanderPreferences, setRefetchCallback, clearRefetchCallback } from '#src/lib/client/cookies';
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

// Add debounce function
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

function TopCommandersCard({
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

  const commanderStats = useMemo(() => {
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

    return stats.join(' / ');
  }, [commander, secondaryStatistic]);

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
      images={commander.cards
        .flatMap((c) => c.imageUrls)
        .map((img) => ({
          src: img,
          alt: `${commander.name} card art`,
        }))}
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
}

function CommandersPageShell({
  sortBy,
  timePeriod,
  colorId,
  minEntries,
  minTournamentSize,
  children,
}: PropsWithChildren<{
  colorId: string;
  minEntries?: number | null;
  minTournamentSize?: number | null;
  sortBy: CommandersSortBy;
  timePeriod: TimePeriod;
}>) {
  useSeoMeta({
    title: 'cEDH Commanders',
    description: 'Discover top performing commanders in cEDH!',
  });

  const [display, toggleDisplay] = useCommandersDisplay();
  const {preferences, updatePreference} = useCommanderPreferences();

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

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

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

  const debouncedMinEntriesUpdate = useCallback(
    debounce((value: string) => {
      if (value === '') {
        updatePreference('minEntries', null);
      } else {
        const numValue = parseInt(value, 10);
        if (!isNaN(numValue) && numValue >= 1) {
          updatePreference('minEntries', numValue);
        }
      }
    }, 300),
    [updatePreference],
  );

  const debouncedEventSizeUpdate = useCallback(
    debounce((value: string) => {
      if (value === '') {
        updatePreference('minTournamentSize', null);
      } else {
        const numValue = parseInt(value, 10);
        if (!isNaN(numValue) && numValue >= 1) {
          updatePreference('minTournamentSize', numValue);
        }
      }
    }, 300),
    [updatePreference],
  );

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Go') {
      (e.target as HTMLInputElement).blur();
      setOpenDropdown(null);
    }
  }, []);

  const handleColorChange = useCallback((value: string | null) => {
    updatePreference('colorId', value);
  }, [updatePreference]);

  const handleSortByChange = useCallback((value: CommandersSortBy) => {
    updatePreference('sortBy', value);
  }, [updatePreference]);

  const handleTimePeriodChange = useCallback((value: TimePeriod) => {
    updatePreference('timePeriod', value);
  }, [updatePreference]);

  const handleDisplayToggle = useCallback(() => {
    const newDisplay = preferences.display === 'table' ? 'card' : 'table';
    updatePreference('display', newDisplay);
  }, [preferences.display, updatePreference]);

  const handleEventSizeChange = useCallback(
    (value: string) => {
      setLocalEventSize(value);
      debouncedEventSizeUpdate(value);
    },
    [debouncedEventSizeUpdate],
  );

  const handleEventSizeSelect = useCallback(
    (value: number | null) => {
      const stringValue = value?.toString() || '';
      setLocalEventSize(stringValue);
      setOpenDropdown(null);
      updatePreference('minTournamentSize', value);
    },
    [updatePreference],
  );

  const handleMinEntriesChange = useCallback(
    (value: string) => {
      setLocalMinEntries(value);
      debouncedMinEntriesUpdate(value);
    },
    [debouncedMinEntriesUpdate],
  );

  const handleMinEntriesSelect = useCallback(
    (value: number | null) => {
      const stringValue = value?.toString() || '';
      setLocalMinEntries(stringValue);
      setOpenDropdown(null);
      updatePreference('minEntries', value);
    },
    [updatePreference],
  );

  return (
    <>
      <Navigation />

      <div className="mx-auto mt-8 w-full max-w-(--breakpoint-xl) px-8">
        <div className="flex w-full items-baseline gap-4">
          <h1 className="font-title mb-8 flex-1 text-5xl font-extrabold text-white lg:mb-0">
            cEDH Metagame Breakdown
          </h1>

          <button className="cursor-pointer" onClick={handleDisplayToggle}>
            {display === 'card' ? (
              <TableCellsIcon className="h-6 w-6 text-white" />
            ) : (
              <RectangleStackIcon className="h-6 w-6 text-white" />
            )}
          </button>
        </div>

        <div className="mb-8 flex flex-col items-start space-y-4 lg:flex-row lg:items-end lg:space-y-0">
          <div className="flex-1">
            <ColorSelection
              selected={colorId}
              onChange={handleColorChange}
            />
          </div>

          <div className="flex flex-wrap justify-center gap-x-4 gap-y-4 lg:flex-nowrap lg:justify-end">
            <div className="relative flex flex-col">
              <Dropdown
                id="commanders-sort-by"
                label="Sort By"
                value={
                  currentSortBy === 'POPULARITY' ? 'Most Popular' : 'Top Performing'
                }
                options={[
                  {
                    value: 'CONVERSION' as CommandersSortBy,
                    label: 'Top Performing',
                  },
                  {
                    value: 'POPULARITY' as CommandersSortBy,
                    label: 'Most Popular',
                  },
                ]}
                onSelect={handleSortByChange}
              />
            </div>

            <div className="relative flex flex-col">
              <Dropdown
                id="commanders-time-period"
                label="Time Period"
                value={
                  currentTimePeriod === 'ONE_MONTH'
                    ? '1 Month'
                    : currentTimePeriod === 'THREE_MONTHS'
                      ? '3 Months'
                      : currentTimePeriod === 'SIX_MONTHS'
                        ? '6 Months'
                        : currentTimePeriod === 'ONE_YEAR'
                          ? '1 Year'
                          : currentTimePeriod === 'ALL_TIME'
                            ? 'All Time'
                            : 'Post Ban'
                }
                options={[
                  {value: 'ONE_MONTH', label: '1 Month'},
                  {value: 'THREE_MONTHS', label: '3 Months'},
                  {value: 'SIX_MONTHS', label: '6 Months'},
                  {value: 'ONE_YEAR', label: '1 Year'},
                  {value: 'ALL_TIME', label: 'All Time'},
                  {value: 'POST_BAN', label: 'Post Ban'},
                ]}
                onSelect={handleTimePeriodChange}
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
                options={[
                  {value: null, label: 'All Entries'},
                  {value: 20, label: '20+ Entries'},
                  {value: 40, label: '40+ Entries'},
                  {value: 60, label: '60+ Entries'},
                  {value: 100, label: '100+ Entries'},
                ]}
                onChange={handleMinEntriesChange}
                onSelect={handleMinEntriesSelect}
                onKeyDown={handleKeyDown}
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
              options={[
                {value: null, label: 'All Tournaments'},
                {value: 30, label: '30+ - Medium Events'},
                {value: 60, label: '60+ - Large Events'},
                {value: 100, label: '100+ - Major Events'},
              ]}
              onChange={handleEventSizeChange}
              onSelect={handleEventSizeSelect}
              onKeyDown={handleKeyDown}
            />
            </div>
          </div>
        </div>

        {children}
      </div>
    </>
  );
}

function useCommandersDisplay() {
  const {display} = useRouteParams('/');
  const {replaceRoute} = useNavigation();

  const toggleDisplay = useCallback(() => {
    replaceRoute('/', {display: display === 'table' ? 'card' : 'table'});
  }, [display, replaceRoute]);

  return useMemo(() => {
    return [display === 'table' ? 'table' : 'card', toggleDisplay] as const;
  }, [display, toggleDisplay]);
}

/** @resource m#index */
export const CommandersPage: EntryPointComponent<
  {commandersQueryRef: pages_CommandersQuery},
  {}
> = ({queries}) => {
  const query = usePreloadedQuery(
    graphql`
      query pages_CommandersQuery(
           $sortBy: CommandersSortBy = CONVERSION
           $timePeriod: TimePeriod = ONE_MONTH
      ) @preloadable {
        ...pages_topCommanders @arguments(sortBy: $sortBy, timePeriod: $timePeriod)
      }
    `,
    queries.commandersQueryRef,
  );

  const [display] = useCommandersDisplay();
  const {preferences}= useCommanderPreferences();

  const {data, loadNext, isLoadingNext, hasNext, refetch} = usePaginationFragment<
    TopCommandersQuery,
    pages_topCommanders$key
  >(
    graphql`
      fragment pages_topCommanders on Query
      @argumentDefinitions(
        cursor: {type: "String"}
        count: {type: "Int", defaultValue: 48}
        sortBy: {type: "CommandersSortBy", defaultValue: CONVERSION}
        timePeriod: {type: "TimePeriod", defaultValue: ONE_MONTH}
      )
      @refetchable(queryName: "TopCommandersQuery") {
        commanders(
          first: $count
          after: $cursor
          sortBy: $sortBy
          timePeriod: $timePeriod
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

  useEffect(() => {
    console.log('🔄 Setting up refetch callback');
    
    setRefetchCallback(() => {
      console.log('🔄 REFETCH TRIGGERED FROM CALLBACK');
      console.log('🔄 Current preferences at refetch time:', preferences);
      
      refetch({
        count: 48,
        cursor: null,
      }, {
        fetchPolicy: 'network-only',
      });
    });
    
    return () => {
      console.log('🔄 Cleaning up refetch callback');
      clearRefetchCallback();
    };
  }, [refetch, preferences]);

  useEffect(() => {
    console.log('📊 === DATA CHANGED ===');
    console.log('📊 Commander count:', data?.commanders?.edges?.length);
    console.log('📊 Full data structure:', data);
    console.log('📊 First edge:', data?.commanders?.edges?.[0]);
    console.log('📊 First node:', data?.commanders?.edges?.[0]?.node);
    console.log('📊 Available node fields:', Object.keys(data?.commanders?.edges?.[0]?.node || {}));
    console.log('📊 Timestamp:', new Date().toISOString());
    console.log('📊 === END DATA CHANGE ===');
  }, [data]);

  return (
    <CommandersPageShell
      sortBy={preferences.sortBy as CommandersSortBy || 'CONVERSION'}
      timePeriod={preferences.timePeriod as TimePeriod || 'ONE_MONTH'}
      colorId={preferences.colorId || ''}
      minEntries={preferences.minEntries || null}
      minTournamentSize={preferences.minTournamentSize || null}
    >
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
            secondaryStatistic={
              preferences.sortBy === 'CONVERSION' ||
              preferences.sortBy === 'TOP_CUTS'
                ? 'topCuts'
                : 'count'
            }
          />
        ))}
      </div>

      <LoadMoreButton
        hasNext={hasNext}
        isLoadingNext={isLoadingNext}
        loadNext={loadNext}
      />

      <Footer />
    </CommandersPageShell>
  );
};
