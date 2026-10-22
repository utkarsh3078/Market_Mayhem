"use client";

import { useEffect } from "react";
import { useGame } from "@/lib/useGame";
import { Dashboard } from "./Dashboard";
import { Landing } from "./Landing";
import { Lobby } from "./Lobby";
import { Results } from "./Results";
import { Toasts } from "./ui";

export function Game() {
  const { state, actions } = useGame();
  const { room, session } = state;
  const code = room?.code;

  // Keep the address bar shareable: /?room=CODE while in a room.
  useEffect(() => {
    if (code) window.history.replaceState(null, "", `/?room=${code}`);
  }, [code]);

  let screen: React.ReactNode;
  if (!room || !session) {
    screen = <Landing state={state} actions={actions} />;
  } else if (room.status === "LOBBY") {
    screen = <Lobby state={state} actions={actions} />;
  } else if (room.status === "FINISHED" && room.results) {
    screen = <Results state={state} actions={actions} />;
  } else {
    screen = <Dashboard state={state} actions={actions} />;
  }

  return (
    <>
      {screen}
      <Toasts toasts={state.toasts} onDismiss={actions.dismissToast} />
    </>
  );
}
