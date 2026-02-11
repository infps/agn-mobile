import api from "@/service/api.service";
import { router } from "expo-router";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";
import { Alert } from "react-native";

export type BirdType = {
  birdId?: string;
  birdName: string;
  color: string;
  sex: string; // "COCK" | "HEN" | "UNKNOWN"
  band?: string;
  band1?: string;
  band2?: string;
  band3?: string;
  band4?: string;
  rfid?: string;
  isActive?: boolean;
  isLost?: boolean;
};

interface BirdContextType {
  birds: BirdType[];
  loading: boolean;
  error: string | null;
  fetchBirds: () => Promise<void>;
  addBird: (birdData: Omit<BirdType, "birdId">) => Promise<boolean>;
  updateBird: (id: string, birdData: Partial<BirdType>) => Promise<void>;
  getBirdsByEvent: (
    eventId: string,
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
      const response = await api.get("/breeder/birds");
      const data = response.data.birds || [];
      setBirds(data);
    } catch (err: any) {
      setError(err.message || "Failed to fetch birds");
      Alert.alert("Error", "Failed to fetch birds");
    } finally {
      setLoading(false);
    }
  }, []);

  const addBird = useCallback(
    async (birdData: Omit<BirdType, "birdId">): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.post("/breeder/birds", {
          name: birdData.birdName,
          color: birdData.color,
          sex: birdData.sex,
          band1: birdData.band1 || "",
          band2: birdData.band2 || "",
          band3: birdData.band3 || "",
          band4: birdData.band4 || "",
        });
        const newBird = response.data.bird;
        setBirds((prev) => [...prev, newBird]);
        return true;
      } catch (err: any) {
        console.log(err);
        setError(err.message || "Failed to add bird");
        Alert.alert("Error", err.response?.data?.message || "Failed to add bird");
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const updateBird = useCallback(
    async (id: string, birdData: Partial<BirdType>): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.patch(`/breeder/birds/${id}`, birdData);
        const updatedBird = response.data.bird;
        setBirds((prev) =>
          prev.map((bird) =>
            bird.birdId === id ? { ...bird, ...updatedBird } : bird
          )
        );
        router.back();
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
    async (eventId: string, searchParams = {}) => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get(
          `/breeder/event/${eventId}/inventory-items`
        );
        const items = response.data.items || response.data.eventInventoryItems || [];
        const birds = items
          .filter((item: any) => item.bird)
          .map((item: any) => item.bird);
        return birds;
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
