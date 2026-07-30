/**
 * Online update.
 *
 * A self-contained feature: everything the Docker update flow needs — transport,
 * state, and UI — lives here and depends only on packages/. Nothing outside this
 * directory should reach past this file.
 */
export { OnlineUpdateProvider, useOnlineUpdateContext } from "./OnlineUpdateProvider";
export { SystemUpdateCard } from "./SystemUpdateCard";
export { UpdateModal } from "./ui/UpdateModal";
export { subscribeUpdateProgress, refreshUpdateProgress } from "./progress/progressStream";
export type { UpdateLinkState, UpdateProgressSnapshot } from "./progress/progressStream";
export type { OnlineUpdateState } from "./useOnlineUpdate";
