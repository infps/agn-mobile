import React from "react";
import { Image, Linking, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAdminData } from "@/hooks/useAdminData";
import { usePermissions } from "@/context/PermissionContext";
import type { EditableUser } from "@/components/admin/UserEditSheet";
import { Button, ButtonRow, Empty, Loading, Row, Rows, Sheet } from "@/components/admin/ui";

/** A row of `/admin/users`: an account, or a legacy breeder standing in for one. */
export interface DirectoryUser extends EditableUser {
  breederId?: number | null;
  isLegacy?: boolean;
  createdAt?: string | null;
}

interface Bird {
  id: number;
  band: string | null;
  birdName: string | null;
  color: string | null;
  sex: number | null;
  rfid: string | null;
}

const SEX: Record<number, string> = { 0: "Unknown", 1: "Cock", 2: "Hen" };

export const isLegacy = (u: { id: string }) => u.id.startsWith("legacy-");

export const nameOf = (u: { name: string | null; lastName: string | null; email?: string | null }) =>
  `${u.name ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "Unnamed";

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <View className="flex-row items-start gap-3 px-4 py-2.5">
      <Text className="w-28 text-xs text-slate-500">{label}</Text>
      {/* Selectable, because the portal's "copy email" and "copy ID" are a
          long-press here rather than a menu item. */}
      <Text selectable className="flex-1 text-sm text-slate-900">
        {value || "—"}
      </Text>
    </View>
  );
}

/**
 * Everything on file for one person, and the things that can be done to them.
 *
 * This is the portal's row click and its row menu folded into one place. The
 * table there has twenty columns; none of them fit across a phone, so the list
 * shows a name and this shows the rest.
 *
 * The actions sit above the details because somebody who opened this to edit
 * should not have to scroll past an address to do it. Each is offered only to
 * whoever the server would let through: editing needs `users.manage`, teams
 * need a breeder record, and deleting is a super admin's alone.
 *
 * A legacy breeder — a record carried over from the old system with no account
 * behind it — can be read and can have teams, but there is no account to edit
 * or delete, and saying so beats a button that fails.
 */
export function UserDetailSheet({
  user,
  onClose,
  onEdit,
  onCopy,
  onTeams,
  onAccess,
  onDelete,
}: {
  user: DirectoryUser | null;
  onClose: () => void;
  onEdit: (user: DirectoryUser) => void;
  onCopy: (user: DirectoryUser) => void;
  onTeams: (user: DirectoryUser) => void;
  onAccess: (user: DirectoryUser) => void;
  onDelete: (user: DirectoryUser) => void;
}) {
  const { can, canAny, role } = usePermissions();
  const mayEdit = can("users.manage");
  // Copy creates a new account (POST /admin/users), which the portal offers to
  // every admin and its route accepts from any ADMIN or SUPERADMIN.
  const mayCopy = role === "ADMIN" || role === "SUPERADMIN";
  const maySeeBirds = canAny("breeders.view", "breeders.manage");
  const mayAssign = canAny("users.permissions", "users.manage");
  const mayDelete = role === "SUPERADMIN";

  const birdsReq = useAdminData<{ birds?: Bird[] }>(
    user?.breederId != null && maySeeBirds ? `/admin/breeders/${user.breederId}/birds` : null,
    [user?.breederId, maySeeBirds]
  );
  const birds = birdsReq.data?.birds ?? [];

  const legacy = user ? isLegacy(user) : false;

  return (
    <Sheet
      open={user != null}
      onClose={onClose}
      title={user ? nameOf(user) : ""}
      subtitle={
        user
          ? [(user.role ?? "breeder").toLowerCase(), (user.status ?? "").toLowerCase()]
              .filter(Boolean)
              .join(" · ")
          : null
      }
    >
      {user ? (
        <>
          <View className="mt-3 flex-row items-center gap-3">
            {user.image ? (
              <Image source={{ uri: user.image }} className="h-14 w-14 rounded-full bg-slate-100" />
            ) : null}
            <View className="flex-1 flex-row flex-wrap" style={{ gap: 8 }}>
              {user.phoneNumber ? (
                <Pressable
                  onPress={() => Linking.openURL(`tel:${user.phoneNumber}`)}
                  className="flex-row items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2"
                >
                  <Ionicons name="call-outline" size={14} color="#fff" />
                  <Text className="text-xs font-medium text-white">Call</Text>
                </Pressable>
              ) : null}
              {user.email ? (
                <Pressable
                  onPress={() => Linking.openURL(`mailto:${user.email}`)}
                  className="flex-row items-center gap-2 rounded-lg border border-slate-300 px-3 py-2"
                >
                  <Ionicons name="mail-outline" size={14} color="#475569" />
                  <Text className="text-xs font-medium text-slate-700">Email</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {legacy ? (
            <Text className="mt-3 text-xs text-slate-500">
              A legacy breeder with no account behind it. Create an account for them to edit
              these details.
            </Text>
          ) : null}

          <ButtonRow>
            {mayEdit && !legacy ? (
              <Button label="Edit" icon="create-outline" onPress={() => onEdit(user)} full />
            ) : null}
            {mayCopy ? (
              <Button
                label="Copy"
                tone="secondary"
                icon="copy-outline"
                onPress={() => onCopy(user)}
                full
              />
            ) : null}
          </ButtonRow>
          <ButtonRow>
            {maySeeBirds ? (
              <Button
                label="Teams"
                tone="secondary"
                icon="people-outline"
                onPress={() => onTeams(user)}
                full
              />
            ) : null}
            {mayAssign && !legacy ? (
              <Button
                label="Access"
                tone="secondary"
                icon="key-outline"
                onPress={() => onAccess(user)}
                full
              />
            ) : null}
          </ButtonRow>

          <View className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <Info label="Email" value={user.email} />
            <Info label="Phone" value={user.phoneNumber} />
            <Info label="Second mobile" value={user.phoneNumber2} />
            <Info label="Username" value={user.username} />
            <Info label="Loft" value={user.loftName} />
            <Info label="Default team" value={user.defaultTeamName} />
            <Info label="Address" value={user.address} />
            <Info label="City" value={user.city} />
            <Info label="State" value={user.state} />
            <Info label="Postal code" value={user.postalCode} />
            <Info label="Country" value={user.country} />
            {user.address2 || user.city2 || user.state2 || user.zip2 ? (
              <Info
                label="Second address"
                value={[user.address2, user.city2, user.state2, user.zip2]
                  .filter(Boolean)
                  .join(", ")}
              />
            ) : null}
            <Info label="Website" value={user.webAddress} />
            <Info label="Legal name" value={user.legalName} />
            <Info label="SSN" value={user.ssn} />
            <Info label="Tax number" value={user.taxNumber} />
            <Info label="Timezone" value={user.timezone} />
            <Info
              label="Created"
              value={user.createdAt ? new Date(user.createdAt).toLocaleDateString() : null}
            />
            {user.note ? <Info label="Note" value={user.note} /> : null}
            <Info label="ID" value={user.id} />
          </View>

          {maySeeBirds ? (
            <>
              <Text className="mb-2 mt-5 text-base font-semibold text-slate-900">
                Birds{user.breederId != null && !birdsReq.loading ? ` (${birds.length})` : ""}
              </Text>
              {user.breederId == null ? (
                <Empty>No breeder record, so no birds.</Empty>
              ) : birdsReq.loading ? (
                <Loading />
              ) : birds.length === 0 ? (
                <Empty>No birds found.</Empty>
              ) : (
                <>
                  <Rows>
                    {birds.slice(0, 100).map((b) => (
                      <Row
                        key={b.id}
                        title={[b.band ?? "No band", b.birdName].filter(Boolean).join(" · ")}
                        subtitle={[b.color, SEX[b.sex ?? 0] ?? "Unknown"].filter(Boolean).join(" · ")}
                        right={b.rfid ?? "no tag"}
                        rightTone={b.rfid ? "text-slate-600" : "text-slate-300"}
                      />
                    ))}
                  </Rows>
                  {birds.length > 100 ? (
                    <Text className="mt-2 text-center text-xs text-slate-400">
                      Showing the first 100 of {birds.length}.
                    </Text>
                  ) : null}
                </>
              )}
            </>
          ) : null}

          {mayDelete && !legacy ? (
            <ButtonRow>
              <Button
                label="Delete this account"
                tone="danger"
                icon="trash-outline"
                onPress={() => onDelete(user)}
                full
              />
            </ButtonRow>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}
