import { useEffect } from "react";
import { getProjects } from "../../lib/config";
import type { AppAction } from "../types";

export function useProjects(dispatch: React.Dispatch<AppAction>) {
  useEffect(() => {
    getProjects().then((projects) => {
      dispatch({ type: "SET_PROJECTS", projects });
    });
  }, [dispatch]);

  return {
    reload: async () => {
      const projects = await getProjects();
      dispatch({ type: "SET_PROJECTS", projects });
    },
  };
}
