import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import api from "./api.service";
import SecureStorageService from "./secureStorage.service";

/**
 * Pulling a file off the portal and handing it to the phone.
 *
 * The portal already renders reports and exports server-side — PDF, CSV and
 * XLSX all come back as real bytes from `/api/admin/reports/...` and the
 * `/export` routes. So nothing here generates anything; the whole job is to
 * fetch a protected URL with the bearer token attached and then get out of the
 * way.
 *
 * It goes through `File.downloadFileAsync` rather than axios because these
 * responses are binary and can be large. Pulling a spreadsheet through axios
 * means holding the whole thing in JS memory as a string first, which is both
 * slower and a good way to run a phone out of heap on a season-wide export.
 *
 * The file lands in the cache directory, not documents: it is a copy of
 * something the portal can regenerate at any time, so it should be disposable.
 * Once it is written the OS share sheet takes over, which is what lets somebody
 * mail it, drop it in Drive, or open it in a spreadsheet app — none of which
 * this app should be trying to do itself.
 */

export interface DownloadResult {
  ok: boolean;
  /** Set when it failed, in words worth showing. */
  problem?: string;
}

/** Strip anything a filesystem will argue about. */
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "download";
}

export async function downloadAndShare(
  /** Path relative to the API root, e.g. `/admin/reports/race-result?raceId=4&format=pdf`. */
  path: string,
  filename: string
): Promise<DownloadResult> {
  const base = (api.defaults.baseURL ?? "").replace(/\/+$/, "");
  if (!base) return { ok: false, problem: "The app does not know where the portal is." };

  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const token = await SecureStorageService.getAccessToken();

  try {
    const folder = new Directory(Paths.cache, "exports");
    // Creating it twice is normal — the first export of the session makes it,
    // every one after finds it already there.
    try {
      folder.create({ intermediates: true });
    } catch {
      // already exists
    }

    const target = new File(folder, safeName(filename));
    const file = await File.downloadFileAsync(url, target, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      // The same report pulled twice in a session should replace itself rather
      // than fail on the second try.
      idempotent: true,
    });

    if (!(await Sharing.isAvailableAsync())) {
      return {
        ok: false,
        problem: "This device cannot share files, so there is nowhere to send it.",
      };
    }

    await Sharing.shareAsync(file.uri);
    return { ok: true };
  } catch (err: any) {
    const said = String(err?.message ?? "");
    // downloadFileAsync puts the status code in the message rather than giving
    // a response object, so the common refusals are read back out of it.
    if (/\b401\b/.test(said)) {
      return { ok: false, problem: "The portal did not accept your sign-in. Sign in again." };
    }
    if (/\b403\b/.test(said)) {
      return { ok: false, problem: "That is not part of your access." };
    }
    if (/\b404\b/.test(said)) {
      return { ok: false, problem: "The portal has nothing to produce for that." };
    }
    return { ok: false, problem: "Could not fetch that from the portal." };
  }
}
