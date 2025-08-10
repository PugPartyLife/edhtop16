import React from 'react';
import { EntryPointComponent, graphql, usePreloadedQuery } from 'react-relay/hooks';
import { pages_CommandersQuery } from '#genfiles/queries/pages_CommandersQuery.graphql';
import { pages_topCommanders$key } from '#genfiles/queries/pages_topCommanders.graphql';
import { TopCommandersQuery } from '#genfiles/queries/TopCommandersQuery.graphql';

import { Footer } from '../components/footer';
import { LoadMoreButton } from '../components/load_more';
import { 
  CommandersPageShell,
  CommandersHeader,
  CommandersFilters,
  CommandersGrid 
} from '../components/commanders_page';
import { useCommandersPage } from '../hooks/useCommanderPage';
import { useSession } from '../lib/client/use_session';

/** @resource m#index */
export const CommandersPage: EntryPointComponent<
  { commandersQueryRef: pages_CommandersQuery },
  {}
> = ({ queries }) => {
  // Session handling
  const { 
    isAuthenticated, 
    sessionData, 
    updatePreferences: updateSessionPrefs 
  } = useSession();

  const query = usePreloadedQuery(
    graphql`
      query pages_CommandersQuery @preloadable {
        ...pages_topCommanders
      }
    `,
    queries.commandersQueryRef,
  );

  const fragmentRef = graphql`
    fragment pages_topCommanders on Query
    @argumentDefinitions(
      cursor: { type: "String" }
      count: { type: "Int", defaultValue: 20 }
    )
    @refetchable(queryName: "TopCommandersQuery") {
      commanders(first: $count, after: $cursor)
        @connection(key: "pages__commanders") {
        edges {
          node {
            id
            ...commandersPage_TopCommandersCard
          }
        }
      }
    }
  `;

  const {
    data,
    currentPreferences,
    secondaryStatistic,
    localMinEntries,
    setLocalMinEntries,
    localEventSize,
    setLocalEventSize,
    inputHandlers,
    hasNext,
    isLoadingNext,
    handleDisplayToggle,
    handleSortByChange,
    handleTimePeriodChange,
    handleColorChange,
    handleLoadMore,
  } = useCommandersPage(query, fragmentRef, {
    // Pass session context to the hook
    isAuthenticated,
    sessionData,
    updatePreferences: updateSessionPrefs,
  });

  return (
    <CommandersPageShell>
      <CommandersHeader
        display={currentPreferences.display}
        onDisplayToggle={handleDisplayToggle}
        isAuthenticated={isAuthenticated}
      />

      <CommandersFilters
        currentPreferences={currentPreferences}
        localMinEntries={localMinEntries}
        setLocalMinEntries={setLocalMinEntries}
        localEventSize={localEventSize}
        setLocalEventSize={setLocalEventSize}
        inputHandlers={inputHandlers}
        onDisplayToggle={handleDisplayToggle}
        onSortByChange={handleSortByChange}
        onTimePeriodChange={handleTimePeriodChange}
        onColorChange={handleColorChange}
      />

      <CommandersGrid
        commanders={data.commanders.edges}
        display={currentPreferences.display}
        secondaryStatistic={secondaryStatistic}
      />

      <LoadMoreButton
        hasNext={hasNext}
        isLoadingNext={isLoadingNext}
        loadNext={handleLoadMore}
      />

      <Footer />
    </CommandersPageShell>
  );
};