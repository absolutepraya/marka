import * as collaborationScopeSchema from "./collaborationScopes";
import * as baseSchema from "./schema";

/** Every table and relation in the library store. */
export const schema = { ...baseSchema, ...collaborationScopeSchema };
