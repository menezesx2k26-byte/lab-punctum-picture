import { createPasswordBridgeServer } from "./server.mjs";

const secret = process.env.PUNCTUM_PASSWORD_BRIDGE_SECRET;
const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port <= 0 || port > 65535)
  throw new Error("PORT must be a valid TCP port.");
const server = createPasswordBridgeServer({
  secret,
  replayDirectory: process.env.PUNCTUM_PASSWORD_BRIDGE_REPLAY_DIR,
  logger: (record) => console.log(JSON.stringify(record)),
});
server.listen(port, "0.0.0.0", () => {
  // Do not log credentials, request bodies or secrets.
  console.log(JSON.stringify({ event: "bridge_listening", component: "punctum-password-bridge" }));
});
