import { loadConfig } from "../lib/config";

export async function hosts(): Promise<void> {
  const config = await loadConfig();
  const hostNames = Object.keys(config.hosts);

  if (hostNames.length === 0) {
    console.log("No remote hosts configured.");
    console.log("\nTo add hosts, edit ~/.config/csm/config.json:");
    console.log(`{
  "hosts": {
    "dev-server": {
      "host": "user@192.168.1.100",
      "defaultRepo": "/home/user/project"
    }
  }
}`);
    return;
  }

  console.log("Configured Remote Hosts:");
  console.log("─".repeat(60));
  console.log(`${"NAME".padEnd(20)} ${"HOST".padEnd(25)} DEFAULT REPO`);
  console.log("─".repeat(60));

  for (const name of hostNames) {
    const hostConfig = config.hosts[name];
    const repo = hostConfig.defaultRepo || "-";
    console.log(`${name.padEnd(20)} ${hostConfig.host.padEnd(25)} ${repo}`);
  }
}
