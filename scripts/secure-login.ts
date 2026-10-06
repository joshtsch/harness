import { saveBitwardenSession, unlockBitwardenSession } from "../src/bitwarden-session.js";

try {
  const session = await unlockBitwardenSession();
  await saveBitwardenSession(session);
  console.log("Bitwarden session stored in a protected temporary file for harness secure commands.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
