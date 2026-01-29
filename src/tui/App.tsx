import React, { useReducer, useCallback } from "react";
import { Box, Text, useStdout } from "ink";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { Dashboard } from "./views/Dashboard";
import { CreateSession } from "./views/CreateSession";
import { SessionDetail } from "./views/SessionDetail";
import { Projects } from "./views/Projects";
import { Tasks } from "./views/Tasks";
import { useSessions } from "./hooks/useSessions";
import { useProjects } from "./hooks/useProjects";
import { useLinearTasks } from "./hooks/useLinearTasks";
import { initialState, appReducer } from "./types";
import { colors } from "./theme";

export function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const { refresh } = useSessions(dispatch);
  const { reload: reloadProjects } = useProjects(dispatch);
  const { refresh: refreshTasks, loadMore: loadMoreTasks, paginationRef } = useLinearTasks(dispatch);
  const { stdout } = useStdout();

  const handleRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const renderTabBar = () => {
    const tabs = [
      { key: "sessions" as const, label: "Sessions" },
      { key: "projects" as const, label: "Projects" },
      { key: "tasks" as const, label: "Tasks" },
    ];

    return (
      <Box paddingX={1} marginBottom={0}>
        {tabs.map((tab, idx) => {
          const isActive = state.activeTab === tab.key;
          return (
            <React.Fragment key={tab.key}>
              {idx > 0 && <Text color={colors.separator}> │ </Text>}
              <Text
                color={isActive ? colors.textBright : colors.muted}
                backgroundColor={isActive ? colors.primary : undefined}
                bold={isActive}
              >
                {isActive ? ` ${tab.label} ` : ` ${tab.label} `}
              </Text>
            </React.Fragment>
          );
        })}
        <Text color={colors.muted} dimColor>  [Tab] switch</Text>
      </Box>
    );
  };

  const renderView = () => {
    if (state.view === "dashboard") {
      return (
        <>
          {renderTabBar()}
          {state.activeTab === "sessions" ? (
            <Dashboard
              state={state}
              dispatch={dispatch}
              onRefresh={handleRefresh}
            />
          ) : state.activeTab === "projects" ? (
            <Projects
              state={state}
              dispatch={dispatch}
              onReloadProjects={reloadProjects}
            />
          ) : (
            <Tasks
              state={state}
              dispatch={dispatch}
              onRefresh={refreshTasks}
              onLoadMore={loadMoreTasks}
              paginationRef={paginationRef}
            />
          )}
        </>
      );
    }

    switch (state.view) {
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
      <Footer view={state.view} activeTab={state.activeTab} />
    </Box>
  );
}
