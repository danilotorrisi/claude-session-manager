import { useEffect } from "react";
import { getHosts } from "../../lib/config";
import type { AppAction } from "../types";

export function useHosts(dispatch: React.Dispatch<AppAction>) {
  useEffect(() => {
    getHosts().then((hosts) => {
      dispatch({ type: "SET_HOSTS", hosts });
    });
  }, [dispatch]);

  return {
    reload: async () => {
      const hosts = await getHosts();
      dispatch({ type: "SET_HOSTS", hosts });
    },
  };
}
