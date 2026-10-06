import { BitwardenKeyCustody } from "../src/bitwarden-custody.js";
import { setupCustody } from "../src/custody-setup.js";
import { runRecoveryDrill } from "../src/recovery-drill.js";
import { exportRecoveryIdentity, importRecoveryIdentity } from "../src/recovery-export.js";
import { resolveBitwardenSession } from "../src/bitwarden-session.js";

const command = process.argv[2] === "--" ? process.argv[3] : process.argv[2];

async function run(): Promise<void> {
  if (!command || !["setup", "drill", "export", "import"].includes(command)) throw new Error("usage: secure-custody <setup|drill|export|import>");
  const session = await resolveBitwardenSession();
  const provider = new BitwardenKeyCustody();
  if (command === "import") {
    const input = option("--input");
    const identity = option("--identity");
    if (!input || !identity || !process.argv.includes("--confirm-import")) throw new Error("usage: secure-custody import --input <export.age> --identity <age-identity> --confirm-import");
    const recovered = await importRecoveryIdentity(input, identity);
    let exists = false;
    try {
      await provider.get("recovery", session);
      exists = true;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("not found")) throw error;
    }
    if (exists && !process.argv.includes("--replace")) throw new Error("recovery custody note exists; pass --replace with --confirm-import");
    const primary = await provider.get("primary", session);
    if (primary.recipient === recovered.recipient || primary.identity === recovered.identity) throw new Error("recovery identity must be distinct from primary identity");
    await provider.put(recovered, session, exists);
    console.log("imported recovery custody note; run secure:custody -- drill before real-record access");
    return;
  }
  const custody = await setupCustody(provider, session);
  if (command === "drill") await runRecoveryDrill(custody.primary, custody.recovery);
  if (command === "export") {
    const output = option("--output");
    const recipient = option("--recipient");
    if (!output || !recipient || !process.argv.includes("--confirm-export")) throw new Error("usage: secure-custody export --output <export.age> --recipient <age-recipient> --confirm-export");
    await exportRecoveryIdentity(custody.recovery, output, recipient);
  }
  console.log(command === "setup" && custody.created ? "created and verified primary/recovery custody notes" : `${command} passed`);
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
