import { Figure } from "./figure";

type CastProps = Omit<Parameters<typeof Figure>[0], "who">;

/*
 * The cast (SDD §17.8, TASKS T10B.4), 48–96 px in the app. Placement rules:
 * the Notary sits beside the contract, never inside it; the Guard stands
 * next to Pay, never on it; the Gremlin appears on /bench only.
 */
export const Scout = (p: CastProps) => <Figure who="scout" {...p} />;
export const Inspector = (p: CastProps) => <Figure who="inspector" {...p} />;
export const Notary = (p: CastProps) => <Figure who="notary" {...p} />;
export const Guard = (p: CastProps) => <Figure who="guard" {...p} />;
export const Gremlin = (p: CastProps) => <Figure who="gremlin" {...p} />;
