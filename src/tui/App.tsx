import React, { useReducer, useCallback } from "react";
import { Box, useStdout } from "ink";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { Dashboard } from "./views/Dashboard";
import { CreateSession } from "./views/CreateSession";
import { SessionDetail } from "./views/SessionDetail";
import { useSessions } from "./hooks/useSessions";
import { initialState, appReducer } from "./types";

export function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const { refresh } = useSessions(dispatch);
  const { stdout } = useStdout();

  const handleRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const renderView = () => {
    switch (state.view) {
      case "dashboard":
        return (
          <Dashboard
            state={state}
            dispatch={dispatch}
            onRefresh={handleRefresh}
          />
        );
      case "create":
        return (
          <CreateSession
            state={state}
            dispatch={dispatch}
            onRefresh={handleRefresh}
          />
        );
      case "detail":
        return (
          <SessionDetail
            state={state}
            dispatch={dispatch}
            onRefresh={handleRefresh}
          />
        );
      default:
        return null;
    }
  };

  const terminalHeight = stdout?.rows || 24;

  return (
    <Box flexDirection="column" minHeight={terminalHeight}>
      <Header />
      <Box flexDirection="column" flexGrow={1}>
        {renderView()}
      </Box>
      <Footer view={state.view} />
    </Box>
  );
}
