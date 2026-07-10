"use client";

import { useCallback, useEffect, useState } from "react";
import {
  defaultFollowed,
  type PulseBoolMap,
  type PulseVoteMap,
} from "@/lib/pulse";

const FOLLOWED_KEY = "pulseai-followed-v2";
const VOTES_KEY = "pulseai-votes";
const SAVED_KEY = "pulseai-saved";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota / private-mode failures — state stays in memory.
  }
}

// Fire boost/suppress into tanj's real learning store when running in Electron.
// Best-effort: failures never block the UI, and web mode simply skips it.
function recordVoteFeedback(articleId: string, vote: 1 | -1 | 0) {
  if (vote === 0) return;
  const desktop = typeof window !== "undefined" ? window.desktop : undefined;
  if (!desktop?.data?.saveUserFeedback) return;
  desktop.data
    .saveUserFeedback({
      clusterId: articleId,
      action: vote === 1 ? "boost" : "suppress",
      value: vote,
    })
    .catch(() => {
      // Signal capture is best-effort; ignore transport errors.
    });
}

export type PulseState = {
  followed: PulseBoolMap;
  votes: PulseVoteMap;
  saved: PulseBoolMap;
  setFollowed: (domain: string, value: boolean) => void;
  setVote: (id: string, vote: 1 | -1) => void;
  toggleSaved: (id: string) => void;
};

/**
 * Followed domains, per-story boost/suppress votes, and the saved list.
 * Persisted to localStorage (works in web + desktop, survives reload) with a
 * two-pass load so the first client render matches SSR and doesn't mismatch.
 */
export function usePulseState(): PulseState {
  const [followed, setFollowedState] = useState<PulseBoolMap>(() => defaultFollowed());
  const [votes, setVotesState] = useState<PulseVoteMap>({});
  const [saved, setSavedState] = useState<PulseBoolMap>({});

  useEffect(() => {
    setFollowedState(readJson<PulseBoolMap>(FOLLOWED_KEY, defaultFollowed()));
    setVotesState(readJson<PulseVoteMap>(VOTES_KEY, {}));
    setSavedState(readJson<PulseBoolMap>(SAVED_KEY, {}));
  }, []);

  const setFollowed = useCallback((domain: string, value: boolean) => {
    setFollowedState((prev) => {
      const next = { ...prev, [domain]: value };
      writeJson(FOLLOWED_KEY, next);
      return next;
    });
  }, []);

  const setVote = useCallback((id: string, vote: 1 | -1) => {
    setVotesState((prev) => {
      const nextVote: 1 | -1 | 0 = prev[id] === vote ? 0 : vote;
      const next = { ...prev, [id]: nextVote };
      writeJson(VOTES_KEY, next);
      recordVoteFeedback(id, nextVote);
      return next;
    });
  }, []);

  const toggleSaved = useCallback((id: string) => {
    setSavedState((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      writeJson(SAVED_KEY, next);
      return next;
    });
  }, []);

  return { followed, votes, saved, setFollowed, setVote, toggleSaved };
}
