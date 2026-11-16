/**
 * What to tell the operator when a screen's data didn't load.
 *
 * "Could not load this just now" on its own hid the cause: a timeout, no
 * connection and a gateway error page all looked the same, so nobody could
 * tell whether to retry, check the Wi-Fi or ring the server team. The status
 * code goes on the end so a screenshot says which it was.
 */
export function describeLoadError(err: any): string {
  const said = err?.response?.data?.message;
  if (typeof said === "string" && said.trim()) return said;

  const status: number | undefined = err?.response?.status;
  if (status) {
    if (status === 404) return "This isn't on the server (404).";
    if (status === 502 || status === 503 || status === 504) {
      return `The server isn't answering right now (${status}). Try again in a minute.`;
    }
    if (status >= 500) return `The server hit an error (${status}).`;
    return `Could not load this (${status}).`;
  }

  if (err?.code === "ECONNABORTED" || /timeout/i.test(err?.message ?? "")) {
    return "The server took too long to answer. Pull down to try again.";
  }
  if (err?.message === "Network Error") {
    return "Can't reach the server. Check the internet connection.";
  }
  return "Could not load this just now.";
}
