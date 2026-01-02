// d:\agn-mobile\context\BirdContext.tsx
import api from "@/service/api.service";
import { router } from "expo-router";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useState
} from "react";
import { Alert } from "react-native";

export type BirdType = {
  idBird?: string;
  birdName: string;
  color: string;
  sex: number;
};

interface BirdContextType {
  birds: BirdType[];
  loading: boolean;
  error: string | null;
  fetchBirds: () => Promise<void>;
  addBird: (
    birdData: Omit<BirdType, "idBird" | "breederId">
  ) => Promise<boolean>;
  updateBird: (id: number, birdData: Partial<BirdType>) => Promise<void>;
  getBirdsByEvent: (
    eventId: number,
    searchParams?: { q?: string; searchField?: string }
  ) => Promise<BirdType[]>;
}

const BirdContext = createContext<BirdContextType | undefined>(undefined);

export const BirdProvider = ({ children }: { children: ReactNode }) => {
  const [birds, setBirds] = useState<BirdType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBirds = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/birds`);
      if (!response.data.success) {
        throw new Error("Failed to fetch birds");
      }
      const data = await response.data.data;
      setBirds(data);
    } catch (err: any) {
      setError(err.message || "Failed to fetch birds");
      Alert.alert("Error", "Failed to fetch birds");
    } finally {
      setLoading(false);
    }
  }, []);

  const addBird = useCallback(
    async (
      birdData: Omit<BirdType, "idBird" | "breederId">
    ): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.post(`/birds`, birdData);
        if (!response.data.success) {
          throw new Error("Failed to add bird");
        }

        const newBird = await response.data.data;
        setBirds((prev) => [...prev, newBird]);
        return true;
      } catch (err: any) {
        console.log(err);
        setError(err.message || "Failed to add bird");
        Alert.alert("Error", "Failed to add bird");
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const updateBird = useCallback(
    async (id: number, birdData: Partial<BirdType>): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.patch(`/api/birds/${id}`, birdData);

        if (!response.data.success) {
          throw new Error("Failed to update bird");
        }

        const updatedBird = await response.data.data;
        setBirds((prev) =>
          prev.map((bird) =>
            bird.idBird === String(id) ? { ...bird, ...updatedBird } : bird
          )
        );
        router.back(); // Navigate back after successful update
      } catch (err: any) {
        setError(err.message || "Failed to update bird");
        Alert.alert("Error", "Failed to update bird");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const getBirdsByEvent = useCallback(
    async (eventId: number, searchParams = {}) => {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams(searchParams).toString();
        const response = await api.get(`/api/events/${eventId}/birds?${query}`);

        if (!response.data.success) {
          throw new Error("Failed to fetch birds for event");
        }

        const data = await response.data.data;
        return data;
      } catch (err: any) {
        setError(err.message || "Failed to fetch birds for event");
        Alert.alert("Error", "Failed to fetch birds for event");
        return [];
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return (
    <BirdContext.Provider
      value={{
        birds,
        loading,
        error,
        fetchBirds,
        addBird,
        updateBird,
        getBirdsByEvent,
      }}
    >
      {children}
    </BirdContext.Provider>
  );
};

export const useBirds = (): BirdContextType => {
  const context = useContext(BirdContext);
  if (context === undefined) {
    throw new Error("useBirds must be used within a BirdProvider");
  }
  return context;
};
