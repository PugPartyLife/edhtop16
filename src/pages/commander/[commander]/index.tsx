import {Commander_CommanderBanner$key} from '#genfiles/queries/Commander_CommanderBanner.graphql';
import {Commander_CommanderMeta$key} from '#genfiles/queries/Commander_CommanderMeta.graphql';
import {Commander_CommanderPageShell$key} from '#genfiles/queries/Commander_CommanderPageShell.graphql';
import {
  Commander_CommanderQuery,
  EntriesSortBy,
  TimePeriod,
} from '#genfiles/queries/Commander_CommanderQuery.graphql';
import {Commander_entries$key} from '#genfiles/queries/Commander_entries.graphql';
import {Commander_EntryCard$key} from '#genfiles/queries/Commander_EntryCard.graphql';
import {CommanderEntriesQuery} from '#genfiles/queries/CommanderEntriesQuery.graphql';
import {Link} from '#genfiles/river/router';
import {useSeoMeta} from '@unhead/react';
import cn from 'classnames';
import {format} from 'date-fns';
import {
  PropsWithChildren,
  useState,
  useEffect,
  useCallback,
  startTransition,
  useMemo,
  useRef,
  memo,
} from 'react';
import {
  EntryPointComponent,
  useFragment,
  usePaginationFragment,
  usePreloadedQuery,
} from 'react-relay/hooks';
import {graphql} from 'relay-runtime';
import {
  usePreferences,
  setRefetchCallback,
  clearRefetchCallback,
  type PreferencesMap,
} from '../../../lib/client/cookies';
import {ColorIdentity} from '../../../assets/icons/colors';
import {Card} from '../../../components/card';
import {Dropdown} from '../../../components/dropdown';
import {Footer} from '../../../components/footer';
import {LoadMoreButton} from '../../../components/load_more';
import {Navigation} from '../../../components/navigation';
import {NumberInputDropdown} from '../../../components/number_input_dropdown';
import {FirstPartyPromo} from '../../../components/promo';
import {Select} from '../../../components/select';
import {formatOrdinals, formatPercent} from '../../../lib/client/format';

const createDebouncedFunction = <T extends (...args: any[]) => any>(
  func: T,
  delay: number,
): T => {
  let timeoutId: NodeJS.Timeout;
  return ((...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  }) as T;
};

const TIME_PERIOD_LABELS: Partial<Record<TimePeriod, string>> = {
  ONE_MONTH: '1 Month',
  THREE_MONTHS: '3 Months',
  SIX_MONTHS: '6 Months',
  ONE_YEAR: '1 Year',
  ALL_TIME: 'All Time',
  POST_BAN: 'Post Ban',
};

const DROPDOWN_OPTIONS = {
  sortBy: [
    {value: 'TOP' as EntriesSortBy, label: 'Top Performing'},
    {value: 'NEW' as EntriesSortBy, label: 'Recent'},
  ],
  timePeriod: [
    {value: 'ONE_MONTH', label: '1 Month'},
    {value: 'THREE_MONTHS', label: '3 Months'},
    {value: 'SIX_MONTHS', label: '6 Months'},
    {value: 'ONE_YEAR', label: '1 Year'},
    {value: 'ALL_TIME', label: 'All Time'},
    {value: 'POST_BAN', label: 'Post Ban'},
  ],
  eventSize: [
    {value: null, label: 'All Events'},
    {value: 32, label: '32+ - Medium Events'},
    {value: 60, label: '60+ - Large Events'},
    {value: 100, label: '100+ - Major Events'},
  ],
  maxStanding: [
    {value: null, label: 'All Players'},
    {value: 1, label: 'Tournament Winners'},
    {value: 4, label: 'Top 4'},
    {value: 16, label: 'Top 16'},
  ],
};

const DEFAULT_PREFERENCES = {
  sortBy: 'TOP' as const,
  timePeriod: 'ONE_YEAR' as const,
  minEventSize: null,
  maxStanding: null,
} as const;

const EntryCard = memo(function EntryCard(props: {
  entry: Commander_EntryCard$key;
}) {
  const entry = useFragment(
    graphql`
      fragment Commander_EntryCard on Entry {
        standing
        wins
        losses
        draws
        decklist

        player {
          name
          isKnownCheater
        }

        tournament {
          name
          size
          tournamentDate
          TID
        }
      }
    `,
    props.entry,
  );

  const entryName = useMemo(() => {
    const playerName = entry.player?.name ?? 'Unknown Player';
    if (entry.standing === 1) {
      return `🥇 ${playerName}`;
    } else if (entry.standing <= 4) {
      return `🥈 ${playerName}`;
    } else if (entry.standing <= 16) {
      return `🥉 ${playerName}`;
    }
    return playerName;
  }, [entry.player?.name, entry.standing]);

  const entryNameNode = useMemo(
    () => (
      <span className="relative flex items-baseline">
        {entryName}
        {entry.player?.isKnownCheater && (
          <span className="absolute right-0 rounded-full bg-red-600 px-2 py-1 text-xs uppercase">
            Cheater
          </span>
        )}
      </span>
    ),
    [entryName, entry.player?.isKnownCheater],
  );

  const bottomText = useMemo(
    () => (
      <div className="flex">
        <span className="flex-1">
          {formatOrdinals(entry.standing)}&nbsp;/&nbsp;
          {entry.tournament.size} players
        </span>
        <span>
          Wins: {entry.wins} / Losses: {entry.losses} / Draws: {entry.draws}
        </span>
      </div>
    ),
    [
      entry.standing,
      entry.tournament.size,
      entry.wins,
      entry.losses,
      entry.draws,
    ],
  );

  const formattedDate = useMemo(
    () => format(entry.tournament.tournamentDate, 'MMMM do yyyy'),
    [entry.tournament.tournamentDate],
  );

  return (
    <Card bottomText={bottomText}>
      <div className="flex h-32 flex-col">
        {entry.decklist ? (
          <a
            href={entry.decklist}
            target="_blank"
            className="line-clamp-1 text-xl font-bold underline decoration-transparent transition-colors hover:decoration-inherit"
          >
            {entryNameNode}
          </a>
        ) : (
          <span className="text-xl font-bold">{entryNameNode}</span>
        )}

        <Link
          href={`/tournament/${entry.tournament.TID}`}
          className="line-clamp-2 pt-2 underline decoration-transparent transition-colors hover:decoration-inherit"
        >
          {entry.tournament.name}
        </Link>
        <span className="line-clamp-1 text-sm opacity-70">{formattedDate}</span>
      </div>
    </Card>
  );
});

const CommanderBanner = memo(function CommanderBanner(props: {
  commander: Commander_CommanderBanner$key;
  dynamicStats?: {
    count: number;
    metaShare: number;
    conversionRate: number;
    topCuts: number;
    topCutBias: number;
  };
}) {
  const commander = useFragment(
    graphql`
      fragment Commander_CommanderBanner on Commander {
        name
        colorId
        cards {
          imageUrls
        }

        stats {
          conversionRate
          topCuts
          count
          metaShare
          topCutBias
        }
      }
    `,
    props.commander,
  );

  const stats = useMemo(
    () => props.dynamicStats || commander.stats,
    [props.dynamicStats, commander.stats],
  );

  const cardImages = useMemo(
    () => commander.cards.flatMap((c) => c.imageUrls),
    [commander.cards],
  );

  const topCutBiasValue = useMemo(
    () =>
      stats.topCutBias > 0
        ? (stats.topCuts / stats.topCutBias).toFixed(1)
        : '0.0',
    [stats.topCuts, stats.topCutBias],
  );

  const statsDisplay = useMemo(
    () => ({
      entries: stats.count,
      metaShare: formatPercent(stats.metaShare),
      conversionRate: formatPercent(stats.conversionRate),
      topCutBias: topCutBiasValue,
    }),
    [stats.count, stats.metaShare, stats.conversionRate, topCutBiasValue],
  );

  return (
    <div className="h-64 w-full bg-black/60 md:h-80">
      <div className="relative mx-auto flex h-full w-full max-w-(--breakpoint-xl) flex-col items-center justify-center">
        <div className="absolute top-0 left-0 flex h-full w-full brightness-40">
          {cardImages.map((src, _i, {length}) => (
            <img
              className={cn(
                'flex-1 object-cover object-top',
                length === 2 ? 'w-1/2' : 'w-full',
              )}
              key={src}
              src={src}
              alt={`${commander.name} art`}
            />
          ))}
        </div>

        <h1 className="font-title relative m-0 mb-4 text-center text-2xl font-semibold text-white md:text-4xl lg:text-5xl">
          {commander.name}
        </h1>

        <div className="relative">
          <ColorIdentity identity={commander.colorId} />
        </div>

        <div className="absolute bottom-0 z-10 mx-auto flex w-full items-center justify-around border-t border-white/60 bg-black/50 px-3 text-center text-sm text-white sm:bottom-3 sm:w-auto sm:rounded-lg sm:border">
          {statsDisplay.entries} Entries
          <div className="mr-1 ml-2 border-l border-white/60 py-2">
            &nbsp;
          </div>{' '}
          {statsDisplay.metaShare} Meta%
          <div className="mr-1 ml-2 border-l border-white/60 py-2">
            &nbsp;
          </div>{' '}
          {statsDisplay.conversionRate} Conversion
          <div className="mr-1 ml-2 border-l border-white/60 py-2">
            &nbsp;
          </div>{' '}
          {statsDisplay.topCutBias} Top Cut Bias
        </div>
      </div>
    </div>
  );
});

function useCommanderMeta(commanderFromProps: Commander_CommanderMeta$key) {
  const commander = useFragment(
    graphql`
      fragment Commander_CommanderMeta on Commander {
        name
      }
    `,
    commanderFromProps,
  );

  useSeoMeta({
    title: commander.name,
    description: `Top Performing and Recent Decklists for ${commander.name} in cEDH`,
  });
}

export const CommanderPageShell = memo(function CommanderPageShell({
  disableNavigation,
  maxStanding,
  minEventSize,
  sortBy,
  timePeriod,
  updatePreference,
  preferences,
  dynamicStatsFromData,
  children,
  ...props
}: PropsWithChildren<{
  disableNavigation?: boolean;
  maxStanding?: number | null;
  minEventSize?: number | null;
  sortBy: EntriesSortBy;
  timePeriod: TimePeriod;
  updatePreference: (key: keyof PreferencesMap['entry'], value: any) => void;
  preferences: PreferencesMap['entry'];
  dynamicStatsFromData?: {
    count: number;
    metaShare: number;
    conversionRate: number;
    topCuts: number;
    topCutBias: number;
  } | null;
  commander: Commander_CommanderPageShell$key;
}>) {
  const commander = useFragment(
    graphql`
      fragment Commander_CommanderPageShell on Commander
      @argumentDefinitions(
        minEventSize: {type: "Int"}
        maxStanding: {type: "Int"}
        timePeriod: {type: "TimePeriod!"}
      ) {
        name
        breakdownUrl
        ...Commander_CommanderBanner
        ...Commander_CommanderMeta

        # Add the new filteredStats field
        filteredStats(
          minEventSize: $minEventSize
          maxStanding: $maxStanding
          timePeriod: $timePeriod
        ) {
          conversionRate
          topCuts
          count
          metaShare
          topCutBias
        }

        promo {
          ...promo_EmbededPromo
        }
      }
    `,
    props.commander,
  );

  useCommanderMeta(commander);

  const dynamicStats = useMemo(
    () => dynamicStatsFromData || commander.filteredStats,
    [dynamicStatsFromData, commander.filteredStats],
  );

  const [localEventSize, setLocalEventSize] = useState(
    minEventSize?.toString() || '',
  );
  const [localMaxStanding, setLocalMaxStanding] = useState(
    maxStanding?.toString() || '',
  );

  const debouncedUpdaters = useMemo(
    () => ({
      eventSize: createDebouncedFunction((value: string) => {
        const numValue = value === '' ? null : parseInt(value, 10);
        if (numValue === null || (!isNaN(numValue) && numValue >= 0)) {
          updatePreference(
            'minEventSize' as keyof PreferencesMap['entry'],
            numValue,
          );
        }
      }, 250),
      maxStanding: createDebouncedFunction((value: string) => {
        const numValue = value === '' ? null : parseInt(value, 10);
        if (numValue === null || (!isNaN(numValue) && numValue >= 1)) {
          updatePreference(
            'maxStanding' as keyof PreferencesMap['entry'],
            numValue,
          );
        }
      }, 250),
    }),
    [updatePreference],
  );

  useEffect(() => {
    setLocalEventSize(minEventSize?.toString() || '');
    setLocalMaxStanding(maxStanding?.toString() || '');
  }, [minEventSize, maxStanding]);

  const handleSortBySelect = useCallback(
    (value: EntriesSortBy) => {
      updatePreference('sortBy' as keyof PreferencesMap['entry'], value);
    },
    [updatePreference],
  );

  const handleTimePeriodSelect = useCallback(
    (value: string) => {
      updatePreference('timePeriod' as keyof PreferencesMap['entry'], value);
    },
    [updatePreference],
  );

  const handleEventSizeChange = useCallback(
    (value: string) => {
      setLocalEventSize(value);
      debouncedUpdaters.eventSize(value);
    },
    [debouncedUpdaters],
  );

  const handleEventSizeSelect = useCallback(
    (value: number | null) => {
      const stringValue = value?.toString() || '';
      startTransition(() => {
        setLocalEventSize(stringValue);
      });
      updatePreference('minEventSize' as keyof PreferencesMap['entry'], value);
    },
    [updatePreference],
  );

  const handleMaxStandingChange = useCallback(
    (value: string) => {
      setLocalMaxStanding(value);
      debouncedUpdaters.maxStanding(value);
    },
    [debouncedUpdaters],
  );

  const handleMaxStandingSelect = useCallback(
    (value: number | null) => {
      const stringValue = value?.toString() || '';
      startTransition(() => {
        setLocalMaxStanding(stringValue);
      });
      updatePreference('maxStanding' as keyof PreferencesMap['entry'], value);
    },
    [updatePreference],
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Go') {
      (e.target as HTMLInputElement).blur();
    }
  }, []);

  const currentTimePeriodLabel = useMemo(
    () =>
      TIME_PERIOD_LABELS[preferences?.timePeriod || timePeriod || undefined] ||
      TIME_PERIOD_LABELS.ONE_YEAR,
    [preferences?.timePeriod, timePeriod],
  );

  const currentSortByLabel = useMemo(
    () => (sortBy === 'TOP' ? 'Top Performing' : 'Recent'),
    [sortBy],
  );

  return (
    <>
      <Navigation />
      <CommanderBanner commander={commander} dynamicStats={dynamicStats} />
      {commander.promo && <FirstPartyPromo promo={commander.promo} />}

      <div className="mx-auto flex flex-wrap justify-center gap-x-4 gap-y-4 lg:flex-nowrap">
        <div className="relative flex flex-col">
          <Dropdown
            id="commander-sort-by"
            label="Sort By"
            value={currentSortByLabel}
            options={DROPDOWN_OPTIONS.sortBy}
            onSelect={handleSortBySelect}
          />
        </div>

        <div className="relative flex flex-col">
          <Dropdown
            id="commander-time-period"
            label="Time Period"
            value={currentTimePeriodLabel || ''}
            options={DROPDOWN_OPTIONS.timePeriod}
            onSelect={handleTimePeriodSelect}
          />
        </div>

        <div className="relative flex flex-col">
          <NumberInputDropdown
            id="commander-event-size"
            label="Event Size"
            value={localEventSize}
            placeholder="Event Size"
            min="0"
            dropdownClassName="event-size-dropdown"
            options={DROPDOWN_OPTIONS.eventSize}
            onChange={handleEventSizeChange}
            onSelect={handleEventSizeSelect}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="relative flex flex-col">
          <NumberInputDropdown
            id="commander-max-standing"
            label="Standing Cutoff"
            value={localMaxStanding}
            placeholder="Standing Cutoff"
            min="1"
            dropdownClassName="max-standing-dropdown"
            options={DROPDOWN_OPTIONS.maxStanding}
            onChange={handleMaxStandingChange}
            onSelect={handleMaxStandingSelect}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>
      {children}
    </>
  );
});

/** @resource m#commander_page */
export const CommanderPage: EntryPointComponent<
  {commanderQueryRef: Commander_CommanderQuery},
  {}
> = ({queries}) => {
  const {preferences, updatePreference, isHydrated} = usePreferences(
    'entry',
    DEFAULT_PREFERENCES,
  );
  const hasRefetchedRef = useRef(false);

  const serverPreferences = useMemo(() => {
    if (
      typeof window !== 'undefined' &&
      (window as any).__SERVER_PREFERENCES__
    ) {
      return (window as any).__SERVER_PREFERENCES__;
    }
    return null;
  }, []);

  const {commander} = usePreloadedQuery(
    graphql`
      query Commander_CommanderQuery(
        $commander: String!
        $sortBy: EntriesSortBy!
        $minEventSize: Int
        $maxStanding: Int
        $timePeriod: TimePeriod!
      ) @preloadable {
        commander(name: $commander) {
          name
          ...Commander_CommanderPageShell
            @arguments(
              minEventSize: $minEventSize
              maxStanding: $maxStanding
              timePeriod: $timePeriod
            )
          ...Commander_entries
            @arguments(
              minEventSize: $minEventSize
              maxStanding: $maxStanding
              timePeriod: $timePeriod
            )
        }
      }
    `,
    queries.commanderQueryRef,
  );

  const {data, loadNext, isLoadingNext, hasNext, refetch} =
    usePaginationFragment<CommanderEntriesQuery, Commander_entries$key>(
      graphql`
        fragment Commander_entries on Commander
        @argumentDefinitions(
          cursor: {type: "String"}
          count: {type: "Int", defaultValue: 48}
          minEventSize: {type: "Int"}
          maxStanding: {type: "Int"}
          timePeriod: {type: "TimePeriod!"}
        )
        @refetchable(queryName: "CommanderEntriesQuery") {
          # Add filteredStats to this fragment so it gets refetched
          filteredStats(
            minEventSize: $minEventSize
            maxStanding: $maxStanding
            timePeriod: $timePeriod
          ) {
            conversionRate
            topCuts
            count
            metaShare
            topCutBias
          }

          entries(
            first: $count
            after: $cursor
            sortBy: $sortBy
            filters: {
              minEventSize: $minEventSize
              maxStanding: $maxStanding
              timePeriod: $timePeriod
            }
          ) @connection(key: "Commander_entries") {
            edges {
              node {
                id
                ...Commander_EntryCard
              }
            }
          }
        }
      `,
      commander,
    );

  const refetchParams = useMemo(
    () => ({
      sortBy: preferences?.sortBy || DEFAULT_PREFERENCES.sortBy,
      timePeriod: preferences?.timePeriod || DEFAULT_PREFERENCES.timePeriod,
      minEventSize: preferences?.minEventSize || undefined,
      maxStanding: preferences?.maxStanding || undefined,
    }),
    [preferences],
  );

  const handleRefetch = useCallback(() => {
    startTransition(() => {
      refetch(refetchParams, {fetchPolicy: 'network-only'});
    });
  }, [refetch, refetchParams]);

  const handleLoadMore = useCallback(
    (count: number) => {
      startTransition(() => {
        loadNext(count);
      });
    },
    [loadNext],
  );

  useEffect(() => {
    setRefetchCallback(handleRefetch);
    return clearRefetchCallback;
  }, [handleRefetch]);

  useEffect(() => {
    if (isHydrated && !hasRefetchedRef.current) {
      hasRefetchedRef.current = true;

      const actualServerPrefs = serverPreferences || DEFAULT_PREFERENCES;
      const prefsMatch =
        JSON.stringify(preferences) === JSON.stringify(actualServerPrefs);

      if (!prefsMatch) {
        setTimeout(() => {
          handleRefetch();
        }, 100);
      }
    }
  }, [isHydrated, preferences, serverPreferences, handleRefetch]);

  const entryCards = useMemo(
    () =>
      data.entries.edges.map(({node}) => (
        <EntryCard key={node.id} entry={node} />
      )),
    [data.entries.edges],
  );

  const shellPreferences = useMemo(
    () => ({
      maxStanding: preferences?.maxStanding || null,
      minEventSize: preferences?.minEventSize || null,
      sortBy: preferences?.sortBy || DEFAULT_PREFERENCES.sortBy,
      timePeriod: preferences?.timePeriod || DEFAULT_PREFERENCES.timePeriod,
    }),
    [preferences],
  );

  return (
    <CommanderPageShell
      commander={commander}
      {...shellPreferences}
      updatePreference={updatePreference}
      preferences={preferences}
      dynamicStatsFromData={data.filteredStats}
    >
      <div className="mx-auto grid w-full max-w-(--breakpoint-xl) grid-cols-1 gap-4 p-6 md:grid-cols-2 lg:grid-cols-3">
        {entryCards}
      </div>

      <LoadMoreButton
        hasNext={hasNext}
        isLoadingNext={isLoadingNext}
        loadNext={handleLoadMore}
      />

      <Footer />
    </CommanderPageShell>
  );
};
