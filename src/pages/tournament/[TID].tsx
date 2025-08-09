import {TID_BreakdownGroupCard$key} from '#genfiles/queries/TID_BreakdownGroupCard.graphql';
import {TID_EntryCard$key} from '#genfiles/queries/TID_EntryCard.graphql';
import {TID_TournamentBanner$key} from '#genfiles/queries/TID_TournamentBanner.graphql';
import {TID_TournamentMeta$key} from '#genfiles/queries/TID_TournamentMeta.graphql';
import {TID_TournamentPageShell$key} from '#genfiles/queries/TID_TournamentPageShell.graphql';
import {TID_TournamentQuery} from '#genfiles/queries/TID_TournamentQuery.graphql';
import {Link} from '#genfiles/river/router';
import ArrowRightIcon from '@heroicons/react/24/solid/ArrowRightIcon';
import {useSeoMeta} from '@unhead/react';
import cn from 'classnames';
import {format} from 'date-fns';
import {
  MouseEvent,
  PropsWithChildren,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  startTransition,
  memo,
} from 'react';
import {
  EntryPointComponent,
  useFragment,
  usePreloadedQuery,
} from 'react-relay/hooks';
import {graphql} from 'relay-runtime';
import {
  usePreferences,
  setRefetchCallback,
  clearRefetchCallback,
  type PreferencesMap,
} from '../../lib/client/cookies';
import {ColorIdentity} from '../../assets/icons/colors';
import {Card} from '../../components/card';
import {Footer} from '../../components/footer';
import {Navigation} from '../../components/navigation';
import {FirstPartyPromo} from '../../components/promo';
import {Tab, TabList} from '../../components/tabs';
import {formatOrdinals, formatPercent} from '../../lib/client/format';


const DEFAULT_PREFERENCES = {
  tab: 'entries' as const,
  commander: null,
} as const;


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


const EntryCard = memo(function EntryCard({
  highlightFirst = true,
  ...props
}: {
  highlightFirst?: boolean;
  entry: TID_EntryCard$key;
}) {
  const entry = useFragment(
    graphql`
      fragment TID_EntryCard on Entry {
        standing
        wins
        losses
        draws
        decklist

        player {
          name
          isKnownCheater
        }

        commander {
          name
          breakdownUrl
          cards {
            imageUrls
          }
        }
      }
    `,
    props.entry,
  );

  const entryName = useMemo(() => {
    const playerName = entry.player?.name ?? 'Unknown Player';
    if (entry.standing === 1) {
      return `🥇 ${playerName}`;
    } else if (entry.standing === 2) {
      return `🥈 ${playerName}`;
    } else if (entry.standing === 3) {
      return `🥉 ${playerName}`;
    }
    return playerName;
  }, [entry.player?.name, entry.standing]);

  const entryNameNode = useMemo(() => (
    <span className="relative flex items-baseline">
      {entryName}
      {entry.player?.isKnownCheater && (
        <span className="absolute right-0 rounded-full bg-red-600 px-2 py-1 text-xs uppercase">
          Cheater
        </span>
      )}
    </span>
  ), [entryName, entry.player?.isKnownCheater]);

  const bottomText = useMemo(() => (
    <div className="flex">
      <span className="flex-1">{formatOrdinals(entry.standing)} place</span>
      <span>
        Wins: {entry.wins} / Losses: {entry.losses} / Draws: {entry.draws}
      </span>
    </div>
  ), [entry.standing, entry.wins, entry.losses, entry.draws]);

  const cardImages = useMemo(() => 
    entry.commander.cards
      .flatMap((c) => c.imageUrls)
      .map((img) => ({
        src: img,
        alt: `${entry.commander.name} art`,
      })),
    [entry.commander.cards, entry.commander.name]
  );

  const cardClassName = useMemo(() => cn(
    'group',
    highlightFirst &&
      'md:first:col-span-2 lg:max-w-3xl lg:first:col-span-3 lg:first:w-full lg:first:justify-self-center',
  ), [highlightFirst]);

  return (
    <Card
      className={cardClassName}
      bottomText={bottomText}
      images={cardImages}
    >
      <div className="flex h-32 flex-col space-y-2 lg:group-first:h-40">
        {entry.decklist ? (
          <a
            href={entry.decklist}
            target="_blank"
            className="line-clamp-2 text-xl font-bold underline decoration-transparent transition-colors hover:decoration-inherit"
          >
            {entryNameNode}
          </a>
        ) : (
          <span className="text-xl font-bold">{entryNameNode}</span>
        )}

        <Link
          href={entry.commander.breakdownUrl}
          className="underline decoration-transparent transition-colors hover:decoration-inherit"
        >
          {entry.commander.name}
        </Link>
      </div>
    </Card>
  );
});


const BreakdownGroupCard = memo(function BreakdownGroupCard({
  onClickGroup,
  ...props
}: {
  onClickGroup?: (groupName: string) => void;
  group: TID_BreakdownGroupCard$key;
}) {
  const {commander, conversionRate, entries, topCuts} = useFragment(
    graphql`
      fragment TID_BreakdownGroupCard on TournamentBreakdownGroup {
        commander {
          name
          breakdownUrl
          colorId
          cards {
            imageUrls
          }
        }

        entries
        topCuts
        conversionRate
      }
    `,
    props.group,
  );

  const bottomText = useMemo(() => (
    <div className="flex flex-wrap justify-between gap-1">
      <span>Top Cuts: {topCuts}</span>
      <span>Entries: {entries}</span>
      <span>Conversion: {formatPercent(conversionRate)}</span>
    </div>
  ), [topCuts, entries, conversionRate]);

  const cardImages = useMemo(() => 
    commander.cards
      .flatMap((c) => c.imageUrls)
      .map((img) => ({
        src: img,
        alt: `${commander.name} art`,
      })),
    [commander.cards, commander.name]
  );

  const handleClick = useCallback(() => {
    onClickGroup?.(commander.name);
  }, [onClickGroup, commander.name]);

  return (
    <Card
      bottomText={bottomText}
      images={cardImages}
    >
      <div className="flex h-32 flex-col space-y-2">
        <button
          className="text-left text-xl font-bold underline decoration-transparent transition-colors group-hover:decoration-inherit"
          onClick={handleClick}
        >
          {commander.name}
        </button>

        <ColorIdentity identity={commander.colorId} />
      </div>
    </Card>
  );
});


const TournamentBanner = memo(function TournamentBanner(props: {tournament: TID_TournamentBanner$key}) {
  const tournament = useFragment(
    graphql`
      fragment TID_TournamentBanner on Tournament {
        name
        size
        tournamentDate
        bracketUrl

        winner: entries(maxStanding: 1) {
          commander {
            cards {
              imageUrls
            }
          }
        }
      }
    `,
    props.tournament,
  );

  const bracketUrl = useMemo(() => {
    try {
      if (!tournament.bracketUrl) return null;
      return new URL(tournament.bracketUrl);
    } catch (e) {
      return null;
    }
  }, [tournament.bracketUrl]);

  const formattedDate = useMemo(() => 
    format(tournament.tournamentDate, 'MMMM do yyyy'),
    [tournament.tournamentDate]
  );

  const winnerImages = useMemo(() => {
    if (!tournament.winner[0]) return [];
    return tournament.winner[0].commander.cards.flatMap((c) => c.imageUrls);
  }, [tournament.winner]);

  const hasWinner = tournament.winner[0] != null;

  return (
    <div className="h-64 w-full bg-black/60 md:h-80">
      <div className="relative mx-auto flex h-full w-full max-w-(--breakpoint-xl) flex-col items-center justify-center space-y-4">
        {hasWinner && (
          <div className="absolute top-0 left-0 flex h-full w-full brightness-40">
            {winnerImages.map((src, _i, {length}) => (
              <img
                className={cn(
                  'flex-1 object-cover object-top',
                  length === 2 ? 'w-1/2' : 'w-full',
                )}
                key={src}
                src={src}
                alt={`${tournament.name} winner art`}
              />
            ))}
          </div>
        )}

        {bracketUrl && (
          <div className="absolute top-4 right-4 z-10 text-xs md:text-sm">
            <a
              href={bracketUrl.href}
              target="_blank"
              rel="noopener norefferer"
              className="text-white underline"
            >
              View Bracket <ArrowRightIcon className="inline h-3 w-3" />
            </a>
          </div>
        )}

        <h1 className="font-title relative text-center text-2xl font-semibold text-white md:text-4xl lg:text-5xl">
          {tournament.name}
        </h1>
        <div className="relative flex w-full max-w-(--breakpoint-md) flex-col items-center justify-evenly gap-1 text-base text-white md:flex-row md:text-lg lg:text-xl">
          <span>{formattedDate}</span>
          <span>{tournament.size} Players</span>
        </div>
      </div>
    </div>
  );
});


function useTournamentMeta(tournamentFromProps: TID_TournamentMeta$key) {
  const tournament = useFragment(
    graphql`
      fragment TID_TournamentMeta on Tournament {
        name
      }
    `,
    tournamentFromProps,
  );

  useSeoMeta({
    title: tournament.name,
    description: `Top Performing cEDH decks at ${tournament.name}`,
  });
}


const TournamentPageShell = memo(function TournamentPageShell({
  tab,
  commanderName,
  updatePreference,
  children,
  ...props
}: PropsWithChildren<{
  tab: string;
  commanderName?: string | null;
  updatePreference: (
    key: keyof PreferencesMap['tournament'],
    value: any,
  ) => void;
  tournament: TID_TournamentPageShell$key;
}>) {
  const tournament = useFragment(
    graphql`
      fragment TID_TournamentPageShell on Tournament {
        TID
        ...TID_TournamentBanner
        ...TID_TournamentMeta

        promo {
          ...promo_EmbededPromo
        }
      }
    `,
    props.tournament,
  );

  useTournamentMeta(tournament);

  const setSelectedTab = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      const nextKey = (e.target as HTMLButtonElement).id as
        | 'entries'
        | 'breakdown'
        | 'commander';

      updatePreference('tab' as keyof PreferencesMap['tournament'], nextKey);

      if (nextKey !== 'commander') {
        updatePreference(
          'commander' as keyof PreferencesMap['tournament'],
          null,
        );
      }
    },
    [updatePreference],
  );

  const showCommanderTab = commanderName != null;

  return (
    <>
      <Navigation />
      <TournamentBanner tournament={tournament} />
      {tournament.promo && <FirstPartyPromo promo={tournament.promo} />}

      <TabList className="mx-auto max-w-(--breakpoint-md)">
        <Tab id="entries" selected={tab === 'entries'} onClick={setSelectedTab}>
          Standings
        </Tab>

        <Tab
          id="breakdown"
          selected={tab === 'breakdown'}
          onClick={setSelectedTab}
        >
          Metagame Breakdown
        </Tab>

        {showCommanderTab && (
          <Tab id="commander" selected={tab === 'commander'}>
            {commanderName}
          </Tab>
        )}
      </TabList>

      {children}
    </>
  );
});

/** @resource m#tournament_view */
export const TournamentViewPage: EntryPointComponent<
  {tournamentQueryRef: TID_TournamentQuery},
  {}
> = ({queries}) => {
  const {preferences, updatePreference, isHydrated} = usePreferences(
    'tournament',
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

  
  const handleRefetch = useCallback(() => {
    
  }, []);

  
  useEffect(() => {
    setRefetchCallback(handleRefetch);
    return clearRefetchCallback;
  }, [handleRefetch]);

  
  useEffect(() => {
    if (isHydrated && !hasRefetchedRef.current) {
      hasRefetchedRef.current = true;

      const actualServerPrefs = serverPreferences || DEFAULT_PREFERENCES;
      const prefsMatch = JSON.stringify(preferences) === JSON.stringify(actualServerPrefs);

      if (!prefsMatch) {
        
      }
    }
  }, [isHydrated, preferences, serverPreferences]);

  const {tournament} = usePreloadedQuery(
    graphql`
      query TID_TournamentQuery(
        $TID: String!
        $commander: String
        $showStandings: Boolean!
        $showBreakdown: Boolean!
        $showBreakdownCommander: Boolean!
      ) @preloadable {
        tournament(TID: $TID) {
          ...TID_TournamentPageShell

          entries @include(if: $showStandings) {
            id
            ...TID_EntryCard
          }

          breakdown @include(if: $showBreakdown) {
            commander {
              id
            }

            ...TID_BreakdownGroupCard
          }

          breakdownEntries: entries(commander: $commander)
            @include(if: $showBreakdownCommander) {
            id
            ...TID_EntryCard
          }
        }
      }
    `,
    queries.tournamentQueryRef,
  );

  
  const handleCommanderSelect = useCallback((commanderName: string) => {
    updatePreference(
      'commander' as keyof PreferencesMap['tournament'],
      commanderName,
    );
    updatePreference(
      'tab' as keyof PreferencesMap['tournament'],
      'commander',
    );
  }, [updatePreference]);

  
  const currentTabFromQuery = useMemo(() => {
    if (queries.tournamentQueryRef.variables.showBreakdown) return 'breakdown';
    if (queries.tournamentQueryRef.variables.showBreakdownCommander) return 'commander';
    return 'entries';
  }, [queries.tournamentQueryRef.variables]);

  const commanderFromQuery = queries.tournamentQueryRef.variables.commander;

  
  const standingsEntries = useMemo(() => 
    tournament.entries?.map((entry) => (
      <EntryCard key={entry.id} entry={entry} />
    )) || [],
    [tournament.entries]
  );

  const breakdownCards = useMemo(() => 
    tournament.breakdown?.map((group) => (
      <BreakdownGroupCard
        key={group.commander.id}
        group={group}
        onClickGroup={handleCommanderSelect}
      />
    )) || [],
    [tournament.breakdown, handleCommanderSelect]
  );

  const commanderEntries = useMemo(() => 
    tournament.breakdownEntries?.map((entry) => (
      <EntryCard key={entry.id} entry={entry} highlightFirst={false} />
    )) || [],
    [tournament.breakdownEntries]
  );

  
  const shellProps = useMemo(() => ({
    tournament,
    commanderName: (isHydrated ? preferences?.commander : commanderFromQuery) || null,
    tab: isHydrated ? (preferences?.tab || 'entries') : currentTabFromQuery,
    updatePreference,
  }), [tournament, isHydrated, preferences, commanderFromQuery, currentTabFromQuery, updatePreference]);

  
  const currentContent = useMemo(() => {
    const currentTab = preferences?.tab || 'entries';
    
    if (currentTab === 'entries') return standingsEntries;
    if (currentTab === 'breakdown') return breakdownCards;
    if (currentTab === 'commander') return commanderEntries;
    
    return [];
  }, [preferences?.tab, standingsEntries, breakdownCards, commanderEntries]);

  if (!isHydrated) {
    return (
      <TournamentPageShell {...shellProps}>
        <div className="mx-auto grid w-full max-w-(--breakpoint-xl) grid-cols-1 gap-4 p-6 md:grid-cols-2 lg:grid-cols-3">
          {queries.tournamentQueryRef.variables.showStandings && standingsEntries}
          {queries.tournamentQueryRef.variables.showBreakdown && breakdownCards}
          {queries.tournamentQueryRef.variables.showBreakdownCommander && commanderEntries}
        </div>
        <Footer />
      </TournamentPageShell>
    );
  }

  return (
    <TournamentPageShell {...shellProps}>
      <div className="mx-auto grid w-full max-w-(--breakpoint-xl) grid-cols-1 gap-4 p-6 md:grid-cols-2 lg:grid-cols-3">
        {currentContent}
      </div>
      <Footer />
    </TournamentPageShell>
  );
};
