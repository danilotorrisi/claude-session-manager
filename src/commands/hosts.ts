import { loadConfig, warnHostsDeprecation } from "../lib/config";

export async function hosts(): Promise<void> {
  const config = await loadConfig();
  const hostNames = Object.keys(config.hosts);

  warnHostsDeprecation(config.hosts);

  if (hostNames.length === 0) {
    console.log("No remote hosts configured.");
    console.log("\nStatic host configuration is deprecated.");
    console.log("Use `csm worker start` on remote machines to register with the master server.");
    console.log("View registered workers with: csm server + Hosts tab in TUI");
    return;
  }

  console.log("Configured Remote Hosts (deprecated — use `csm worker start` instead):");
  console.log("\u2500".repeat(60));
  console.log(`${"NAME".padEnd(20)} ${"HOST".padEnd(25)} DEFAULT REPO`);
  console.log("\u2500".repeat(60));

  for (const name of hostNames) {
    const hostConfig = config.hosts[name];
    const repo = hostConfig.defaultRepo || "-";
    console.log(`${name.padEnd(20)} ${hostConfig.host.padEnd(25)} ${repo}`);
  }

  console.log();
  console.log("Migrate: run `csm worker start` on each remote machine with CSM_MASTER_URL set.");
}
