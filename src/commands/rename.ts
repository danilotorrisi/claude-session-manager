import { sessionExists, renameSession } from "../lib/tmux";

export async function rename(oldName: string, newName: string, options: { host?: string }): Promise<void> {
  const { host } = options;

  // Validate new name
  if (!/^[a-zA-Z0-9_-]+$/.test(newName)) {
    console.error("Error: Session name must only contain alphanumeric characters, hyphens, and underscores");
    process.exit(1);
  }

  // Check old session exists
  if (!(await sessionExists(oldName, host))) {
    console.error(`Error: Session '${oldName}' does not exist`);
    process.exit(1);
  }

  console.log(`Renaming session '${oldName}' to '${newName}'...`);

  const result = await renameSession(oldName, newName, host);
  if (!result.success) {
    console.error(`Error: ${result.stderr}`);
    process.exit(1);
  }

  console.log(`Session renamed to '${newName}' successfully!`);
}
