/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as cases from "../cases.js";
import type * as jev from "../jev.js";
import type * as lib_catalogue from "../lib/catalogue.js";
import type * as lib_engine from "../lib/engine.js";
import type * as lib_types from "../lib/types.js";
import type * as lib_verify from "../lib/verify.js";
import type * as llm from "../llm.js";
import type * as pipeline from "../pipeline.js";
import type * as runs from "../runs.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  cases: typeof cases;
  jev: typeof jev;
  "lib/catalogue": typeof lib_catalogue;
  "lib/engine": typeof lib_engine;
  "lib/types": typeof lib_types;
  "lib/verify": typeof lib_verify;
  llm: typeof llm;
  pipeline: typeof pipeline;
  runs: typeof runs;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
