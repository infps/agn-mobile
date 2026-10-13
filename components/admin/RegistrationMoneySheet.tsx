import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import {
  Button,
  ButtonRow,
  Confirm,
  Empty,
  Field,
  Loading,
  Notice,
  Row,
  Rows,
  Sheet,
  money,
} from "@/components/admin/ui";
import {
  Caption,
  Chips,
  Line,
  PAYMENT_METHODS,
  PAYMENT_TYPES,
  type PaymentMethodCode,
  type PaymentTypeCode,
  methodLabel,
  parseAmount,
  typeLabel,
} from "@/components/admin/MoneyBits";

/** What the caller already knows about the registration. Only the id is required. */
export interface RegistrationMoney {
  eventInventoryId: number;
  breederId?: number | null;
  breederName: string;
  loft?: string | null;
  charged?: number;
  paid?: number;
  refunded?: number;
  refundOwed?: number;
  balance?: number;
  prizeEarned?: number;
  classEarned?: number;
  owedOut?: number;
  cashPromised?: boolean | null;
}

interface Payment {
  id: number;
  paymentValue: number | null;
  paymentMethod: number | null;
  paymentType: number | null;
  paymentDesc: string | null;
  transactionId: string | null;
  paymentDate: string | null;
  status: string | null;
}

interface InventoryDetail {
  eventInventory?: {
    id: number;
    breederId: number | null;
    payments?: Payment[];
    refunds?: { id: number; amount: number }[];
  };
}

type Mode = "home" | "payment" | "refund";

const BLANK_PAYMENT = {
  amount: "",
  method: "CASH" as PaymentMethodCode,
  type: "OTHER" as PaymentTypeCode,
  description: "",
  reference: "",
};

const BLANK_REFUND = { amount: "", reason: "", method: "", reference: "" };

/**
 * One registration's money: what was taken, and everything done about it.
 *
 * This is the phone's version of the payments half of the portal's breeder
 * dialog. It opens from a ledger line because that is where the question gets
 * asked — somebody is told a balance, disputes it, and the next thing anyone
 * needs is the list of payments behind the figure.
 *
 * Every payment can be corrected or removed here, the same as in the portal,
 * and a refund is issued from here too. The two are kept apart deliberately: a
 * refund is its own record that leaves the original payment standing, while
 * deleting a payment erases the fact that money was ever taken. The delete says
 * so, with the amount, before it happens.
 *
 * The confirm steps are rendered inside the sheet rather than beside it. Two
 * sibling modals cannot be on screen at once on iOS, but a modal presented from
 * inside another one can.
 */
export function RegistrationMoneySheet({
  open,
  onClose,
  eventId,
  registration,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  eventId: number | string | null | undefined;
  registration: RegistrationMoney | null;
  /** Called after anything is written, so the screen underneath can reload. */
  onChanged: () => void;
}) {
  const { can, canAny } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const [mode, setMode] = useState<Mode>("home");
  const [editing, setEditing] = useState<Payment | null>(null);
  const [form, setForm] = useState(BLANK_PAYMENT);
  const [refund, setRefund] = useState(BLANK_REFUND);
  const [deleting, setDeleting] = useState(false);
  const [confirmingRefund, setConfirmingRefund] = useState(false);
  const [confirmingCash, setConfirmingCash] = useState(false);

  const mayPay = can("payments.manage");
  const mayRefund = can("refunds.manage");
  // The payment list comes from the registration itself, which the portal
  // guards with the breeders permission rather than the payments one.
  const mayList = canAny("breeders.view", "breeders.manage");

  const id = registration?.eventInventoryId ?? null;
  const detail = useAdminData<InventoryDetail>(
    open && id != null && mayList ? `/admin/event-inventory/${id}` : null,
    [open, id]
  );

  // Each registration opens on its summary, never on a half-filled form left
  // over from the last one.
  useEffect(() => {
    if (!open) return;
    setMode("home");
    setEditing(null);
    setForm(BLANK_PAYMENT);
    setRefund(BLANK_REFUND);
  }, [open, id]);

  const payments = detail.data?.eventInventory?.payments ?? [];
  const owedRefunds = detail.data?.eventInventory?.refunds ?? [];
  const breederId = registration?.breederId ?? detail.data?.eventInventory?.breederId ?? null;
  const balance = registration?.balance ?? null;
  const won = (registration?.prizeEarned ?? 0) + (registration?.classEarned ?? 0);

  const done = () => {
    detail.reload();
    onChanged();
  };

  const startAdding = () => {
    setEditing(null);
    setForm({
      ...BLANK_PAYMENT,
      amount: balance != null && balance > 0 ? balance.toFixed(2) : "",
    });
    setMode("payment");
  };

  const startEditing = (p: Payment) => {
    setEditing(p);
    setForm({
      amount: String(p.paymentValue ?? 0),
      method: PAYMENT_METHODS[p.paymentMethod ?? 0]?.key ?? "CASH",
      type: PAYMENT_TYPES[p.paymentType ?? 4]?.key ?? "OTHER",
      description: p.paymentDesc ?? "",
      reference: p.transactionId ?? "",
    });
    setMode("payment");
  };

  // A refund or an adjustment may be negative; a fee payment may not.
  const signed = form.type === "PAYOUTS" || form.type === "OTHER";

  const savePayment = async () => {
    if (id == null) return;
    const amount = parseAmount(form.amount);
    if (amount == null || amount === 0 || (!signed && amount < 0)) {
      toast.error(signed ? "Give an amount other than zero." : "Give an amount above zero.");
      return;
    }

    if (editing) {
      const { ok } = await action.run(
        "put",
        "/admin/payment",
        {
          paymentId: editing.id,
          amountPaid: amount,
          method: form.method,
          paymentType: form.type,
          description: form.description.trim(),
          referenceNumber: form.reference.trim(),
        },
        { success: "Payment updated." }
      );
      if (ok) {
        setMode("home");
        setEditing(null);
        done();
      }
      return;
    }

    if (breederId == null) {
      toast.error("This registration has no breeder attached, so a payment cannot be filed against it.");
      return;
    }
    const { ok } = await action.run(
      "post",
      "/admin/payment",
      {
        eventInventoryId: id,
        breederId,
        amountPaid: amount,
        method: form.method,
        paymentType: form.type,
        description: form.description.trim() || undefined,
        referenceNumber: form.reference.trim() || undefined,
      },
      { success: `${money(amount)} recorded.` }
    );
    if (ok) {
      setMode("home");
      done();
    }
  };

  const deletePayment = async () => {
    if (!editing) return;
    const { ok } = await action.run("delete", `/admin/payment/${editing.id}`, undefined, {
      success: "Payment deleted.",
    });
    setDeleting(false);
    if (ok) {
      setMode("home");
      setEditing(null);
      done();
    }
  };

  /** The portal's one-tap "cash received" — the whole balance, as cash. */
  const takeCash = async () => {
    if (id == null || breederId == null || balance == null || balance <= 0) return;
    const { ok } = await action.run(
      "post",
      "/admin/payment",
      {
        eventInventoryId: id,
        breederId,
        amountPaid: balance,
        method: "CASH",
        paymentType: "OTHER",
        description: "Cash payment received",
      },
      { success: `${money(balance)} cash recorded.` }
    );
    setConfirmingCash(false);
    if (ok) done();
  };

  const refundAmount = parseAmount(refund.amount);

  const askRefund = () => {
    if (refundAmount == null || refundAmount <= 0) {
      toast.error("Give an amount above zero.");
      return;
    }
    setConfirmingRefund(true);
  };

  const issueRefund = async () => {
    if (id == null || eventId == null || refundAmount == null) return;
    const { ok, data: said } = await action.run<{ message?: string }>(
      "post",
      `/admin/event/${eventId}/refunds`,
      {
        eventInventoryId: id,
        amount: refundAmount,
        reason: refund.reason.trim() || null,
        method: refund.method.trim() || null,
        reference: refund.reference.trim() || null,
      }
    );
    setConfirmingRefund(false);
    if (ok) {
      toast.success(said?.message ?? `${money(refundAmount)} refunded.`);
      setRefund(BLANK_REFUND);
      setMode("home");
      done();
    }
  };

  const who = registration?.breederName || "this breeder";

  const title =
    mode === "payment"
      ? editing
        ? "Edit payment"
        : `Take payment from ${who}`
      : mode === "refund"
        ? `Refund ${who}`
        : registration?.breederName || "Registration";

  const subtitle =
    mode === "payment"
      ? editing
        ? `${money(editing.paymentValue)} · ${who}`
        : balance != null && balance > 0
          ? `They owe ${money(balance)}`
          : "Nothing is outstanding — this records a payment anyway"
      : mode === "refund"
        ? registration?.paid != null
          ? `Paid so far ${money(registration.paid)} · already refunded ${money(
              registration.refunded ?? 0
            )}`
          : "A refund cannot exceed what was paid"
        : [registration?.loft || "No loft", registration?.cashPromised ? "cash promised" : null]
            .filter(Boolean)
            .join(" · ");

  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle={subtitle}>
      {mode === "home" ? (
        <>
          {registration?.charged != null ? (
            <View className="mt-3">
              <Rows>
                <Line label="Charged" value={money(registration.charged)} />
                <Line label="Paid" value={money(registration.paid ?? 0)} tone="text-emerald-600" />
                {registration.refunded ? (
                  <Line label="Refunded" value={money(registration.refunded)} />
                ) : null}
                <Line
                  label="Balance"
                  value={money(registration.balance ?? 0)}
                  tone={(registration.balance ?? 0) > 0 ? "text-rose-600" : "text-slate-900"}
                />
                {won ? <Line label="Won" value={money(won)} /> : null}
                {registration.owedOut ? (
                  <Line label="Owed out" value={money(registration.owedOut)} tone="text-blue-600" />
                ) : null}
              </Rows>
            </View>
          ) : null}

          {registration?.refundOwed ? (
            <Notice tone="rose">
              {money(registration.refundOwed)} is due back to this breeder and has not been paid
              yet.
            </Notice>
          ) : owedRefunds.length > 0 ? (
            <Notice tone="rose">
              {money(owedRefunds.reduce((s, r) => s + r.amount, 0))} is due back to this breeder
              and has not been paid yet.
            </Notice>
          ) : null}

          {mayPay || mayRefund ? (
            <>
              <ButtonRow>
                {mayPay ? (
                  <Button label="Add payment" icon="add" onPress={startAdding} full />
                ) : null}
                {mayRefund ? (
                  <Button
                    label="Refund"
                    tone="secondary"
                    icon="arrow-undo-outline"
                    onPress={() => {
                      setRefund(BLANK_REFUND);
                      setMode("refund");
                    }}
                    full
                  />
                ) : null}
              </ButtonRow>
              {mayPay && balance != null && balance > 0 && breederId != null ? (
                <ButtonRow>
                  <Button
                    label={`Cash received — ${money(balance)}`}
                    tone="success"
                    icon="cash-outline"
                    onPress={() => setConfirmingCash(true)}
                    full
                  />
                </ButtonRow>
              ) : null}
            </>
          ) : null}

          <Caption>Payments</Caption>
          {!mayList ? (
            <Notice>
              The list of payments is read from the registration, which needs breeder access you
              have not been given.
            </Notice>
          ) : detail.loading ? (
            <Loading />
          ) : detail.forbidden ? (
            <Notice>The payments on this registration are not part of your access.</Notice>
          ) : detail.error ? (
            <Notice>{detail.error}</Notice>
          ) : payments.length === 0 ? (
            <Empty>No payments have been recorded.</Empty>
          ) : (
            <Rows>
              {payments.map((p) => (
                <Row
                  key={p.id}
                  title={
                    [typeLabel(p.paymentType), methodLabel(p.paymentMethod)]
                      .filter(Boolean)
                      .join(" · ") || "Payment"
                  }
                  subtitle={
                    [
                      p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : null,
                      p.paymentDesc,
                      p.transactionId ? `ref ${p.transactionId}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || undefined
                  }
                  right={money(p.paymentValue ?? 0)}
                  rightTone={p.status === "PAID" ? "text-emerald-600" : "text-slate-500"}
                  badge={
                    p.status && p.status !== "PAID"
                      ? {
                          label: p.status.toLowerCase(),
                          bg: "bg-amber-100",
                          text: "text-amber-700",
                        }
                      : null
                  }
                  onPress={mayPay ? () => startEditing(p) : undefined}
                />
              ))}
            </Rows>
          )}
        </>
      ) : null}

      {mode === "payment" ? (
        <>
          <Field
            label="Amount"
            value={form.amount}
            onChange={(v) => setForm({ ...form, amount: v })}
            // The decimal pad has no minus key, and a refund or an adjustment
            // is allowed to be negative.
            keyboard={signed ? "default" : "decimal-pad"}
            placeholder="0.00"
            hint={signed ? "A refund or adjustment may be negative." : null}
          />
          <Chips
            label="Method"
            options={PAYMENT_METHODS}
            value={form.method}
            onChange={(method) => setForm({ ...form, method })}
          />
          <Chips
            label="Type"
            options={PAYMENT_TYPES}
            value={form.type}
            onChange={(type) => setForm({ ...form, type })}
          />
          <Field
            label="Description"
            value={form.description}
            onChange={(v) => setForm({ ...form, description: v })}
          />
          <Field
            label="Reference"
            value={form.reference}
            onChange={(v) => setForm({ ...form, reference: v })}
            placeholder="Cheque number, transaction id"
          />
          <ButtonRow>
            <Button label="Back" tone="secondary" onPress={() => setMode("home")} full />
            <Button
              label={editing ? "Save changes" : "Record it"}
              onPress={savePayment}
              pending={action.pending && !deleting}
              full
            />
          </ButtonRow>
          {editing ? (
            <ButtonRow>
              <Button
                label="Delete this payment"
                tone="danger"
                icon="trash-outline"
                onPress={() => setDeleting(true)}
                full
              />
            </ButtonRow>
          ) : null}
        </>
      ) : null}

      {mode === "refund" ? (
        <>
          <Text className="mt-2 text-xs text-slate-500">
            The refund is kept as its own record, so the ledger still shows what was charged and
            paid.
          </Text>
          <Field
            label="Amount"
            value={refund.amount}
            onChange={(v) => setRefund({ ...refund, amount: v })}
            keyboard="decimal-pad"
            placeholder="0.00"
          />
          <Field
            label="Why (optional)"
            value={refund.reason}
            onChange={(v) => setRefund({ ...refund, reason: v })}
            placeholder="Withdrawn before basketing"
          />
          <Field
            label="Method (optional)"
            value={refund.method}
            onChange={(v) => setRefund({ ...refund, method: v })}
            placeholder="Cash, cheque, PayPal"
          />
          <Field
            label="Reference (optional)"
            value={refund.reference}
            onChange={(v) => setRefund({ ...refund, reference: v })}
          />
          <ButtonRow>
            <Button label="Back" tone="secondary" onPress={() => setMode("home")} full />
            <Button label="Refund" tone="danger" onPress={askRefund} full />
          </ButtonRow>
        </>
      ) : null}

      <Confirm
        open={deleting}
        title={`Delete this ${money(editing?.paymentValue ?? 0)} payment?`}
        body={`It is removed from ${who}'s registration outright, and their balance goes back up by ${money(
          editing?.paymentValue ?? 0
        )}. If money is being handed back, record a refund instead — that keeps the payment on the books.`}
        confirmLabel="Delete it"
        pending={action.pending}
        onConfirm={deletePayment}
        onCancel={() => setDeleting(false)}
      />

      <Confirm
        open={confirmingRefund}
        title={`Refund ${money(refundAmount ?? 0)}?`}
        body={`${money(refundAmount ?? 0)} is recorded as returned to ${who}${
          refund.reason.trim() ? ` — ${refund.reason.trim()}` : ""
        }. A refund cannot be edited or removed afterwards.`}
        confirmLabel="Refund"
        pending={action.pending}
        onConfirm={issueRefund}
        onCancel={() => setConfirmingRefund(false)}
      />

      <Confirm
        open={confirmingCash}
        title={`Record ${money(balance ?? 0)} in cash?`}
        body={`The whole outstanding balance is recorded as a cash payment from ${who}, which settles the registration.`}
        confirmLabel="Record it"
        tone="success"
        pending={action.pending}
        onConfirm={takeCash}
        onCancel={() => setConfirmingCash(false)}
      />
    </Sheet>
  );
}
