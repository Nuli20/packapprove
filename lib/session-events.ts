/** No identity, credential or private data is broadcast or persisted. */
export function notifySessionChange(reason: "login" | "logout") {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel("packapprove-session");
  channel.postMessage(reason);
  channel.close();
}
