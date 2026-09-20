import { useCallback, useRef, useState } from "react";
import api from "@/service/api.service";
import { useToast } from "@/context/ToastContext";

type Method = "post" | "put" | "patch" | "delete";

export interface RunOptions {
  /** Said in a toast when the server accepts it. */
  success?: string;
  /** Run after a successful call — usually the section's reload. */
  onDone?: () => void;
}

export interface Outcome<T = any> {
  ok: boolean;
  /**
   * What the server sent back.
   *
   * Some routes answer 200 with something the operator still needs to read —
   * scan-loft says "Bird already in group X", the basket assigner returns the
   * plan it would apply. Returning the body rather than a bare boolean is what
   * lets a screen show that instead of a generic "done".
   */
  data: T | null;
}

export interface AdminAction {
  /** True while a call is in flight, for disabling the control that started it. */
  pending: boolean;
  run: <T = any>(
    method: Method,
    path: string,
    body?: unknown,
    options?: RunOptions
  ) => Promise<Outcome<T>>;
}

/**
 * One write, with the failure handling every admin action needs.
 *
 * The portal's routes already answer refusals in words an operator can act on —
 * "Target group at capacity (40)", "Close it first", "Can only toggle betting on
 * a race that has not started". Those sentences are the whole value of the
 * error: replacing them with "Something went wrong" throws away the only part
 * that tells somebody what to do next. So the server's message is what gets
 * shown, and a generic line is used only when there isn't one.
 *
 * Double-submission is guarded with a ref rather than the pending state,
 * because state lands a render too late — a fast double-tap on "Assign" would
 * otherwise send two, and these actions are not all idempotent.
 */
export function useAdminAction(): AdminAction {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const run = useCallback(
    async (method: Method, path: string, body?: unknown, options?: RunOptions) => {
      if (inFlight.current) return { ok: false, data: null };
      inFlight.current = true;
      setPending(true);

      try {
        const res =
          method === "delete"
            ? await api.delete(path, body ? { data: body } : undefined)
            : await api[method](path, body ?? {});
        if (options?.success) toast.success(options.success);
        options?.onDone?.();
        return { ok: true, data: res?.data ?? null };
      } catch (err: any) {
        const status = err?.response?.status;
        const said = err?.response?.data?.message;

        if (said) {
          toast.error(said);
        } else if (status === 401 || status === 403) {
          // Refusal, not failure — the same distinction useAdminData draws.
          toast.error("That is not part of your access.");
        } else if (err?.code === "ECONNABORTED") {
          toast.error("The server took too long. Nothing was changed.");
        } else {
          toast.error("That did not go through.");
        }
        return { ok: false, data: null };
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [toast]
  );

  return { pending, run };
}
