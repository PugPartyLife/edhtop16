import CardsQueryParameters from '#genfiles/queries/cards_CardsQuery$parameters';
import {JSResource, ModuleType} from '#genfiles/river/js_resource';
import {EntryPointParams} from '#genfiles/river/router';
import {EntryPoint} from 'react-relay/hooks';

/**
 * @route /cards
 */
export const entrypoint: EntryPoint<
  ModuleType<'m#cards'>,
  EntryPointParams<'/cards'>
> = {
  root: JSResource.fromModuleId('m#cards'),
  getPreloadProps() {
    return {
      queries: {
        cardsQueryRef: {
          parameters: CardsQueryParameters,
          variables: {},
        },
      },
    };
  },
};

