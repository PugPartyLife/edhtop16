import CommandersQueryParameters from '#genfiles/queries/pages_CommandersQuery$parameters';
import {JSResource, ModuleType} from '#genfiles/river/js_resource';
import {EntryPointParams} from '#genfiles/river/router';
import {EntryPoint} from 'react-relay/hooks';

/**
 * @route /
 */
export const entrypoint: EntryPoint<
  ModuleType<'m#index'>,
  EntryPointParams<'/'>
> = {
  root: JSResource.fromModuleId('m#index'),
  getPreloadProps() {
    
    console.log('🍪 [SERVER] Using server defaults - cookies will be handled client-side');
    
    return {
      queries: {
        commandersQueryRef: {
          parameters: CommandersQueryParameters,
          variables: {}, // Empty variables - let client handle preferences
        },
      },
    };
  },
};