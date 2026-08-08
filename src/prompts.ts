import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

export async function confirm(message: string): Promise<boolean> {
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await terminal.question(`${message} Type YES to continue: `);
    return answer.trim() === "YES";
  } finally {
    terminal.close();
  }
}

export async function waitForUser(message: string): Promise<void> {
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    await terminal.question(`${message}\nPress Enter when ready...`);
  } finally {
    terminal.close();
  }
}
