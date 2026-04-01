import { bootstrap } from "./bootstrap.js";
import { startHttpServer } from "./http-server.js";

async function main() {
  const services = bootstrap(process.env.MCP_CONFIG_PATH);
  await startHttpServer(services);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
