import api from "@/service/api.service";
import * as ImagePicker from "expo-image-picker";

/**
 * Choosing a bird's photo and sending it to the portal.
 *
 * `POST /api/breeder/birds/[birdId]/image` reads one multipart field called
 * `image` and replaces whatever photo the bird had; `DELETE` on the same path
 * clears it. Both insist the caller owns the bird.
 */
export interface PickedPhoto {
  uri: string;
  name: string;
  type: string;
}

/** Returns null when the breeder backs out; throws a readable message when the phone refuses. */
export async function pickBirdPhoto(from: "camera" | "library"): Promise<PickedPhoto | null> {
  if (from === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error("Camera access is turned off for this app.");
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new Error("Photo access is turned off for this app.");
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  };
  const result =
    from === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const type = asset.mimeType ?? "image/jpeg";
  const ext = type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  return {
    uri: asset.uri,
    name: asset.fileName ?? `bird-${Date.now()}.${ext}`,
    type,
  };
}

/** Resolves to the stored image URL. */
export async function uploadBirdPhoto(
  birdId: number | string,
  photo: PickedPhoto
): Promise<string | null> {
  const form = new FormData();
  // React Native's FormData takes a file as { uri, name, type }.
  form.append("image", { uri: photo.uri, name: photo.name, type: photo.type } as any);
  const { data } = await api.post(`/breeder/birds/${birdId}/image`, form, {
    headers: { "Content-Type": "multipart/form-data" },
    // A photo over a mobile connection needs longer than a JSON call.
    timeout: 60000,
  });
  return data?.image ?? null;
}

export async function deleteBirdPhoto(birdId: number | string): Promise<void> {
  await api.delete(`/breeder/birds/${birdId}/image`);
}
