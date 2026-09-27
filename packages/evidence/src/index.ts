// evidence: snapshots, source adapters and the fact store (SDD §11, TASKS Phase 7).
// Supabase wiring lives in `@cartel/evidence/supabase` so pure consumers don't load it.
export * from "./adapters/cpsc";
export * from "./adapters/greathub";
export * from "./adapters/icecat";
export * from "./adapters/openfoodfacts";
export * from "./adapters/roles";
export * from "./adapters/shopify";
export * from "./adapters/shopify-auth";
export * from "./adapters/upcitemdb";
export * from "./checkout";
export * from "./claims";
export * from "./fact-store";
export * from "./http";
export * from "./jsonld";
export * from "./quote";
export * from "./snapshot";
export * from "./sources";
export * from "./types";
