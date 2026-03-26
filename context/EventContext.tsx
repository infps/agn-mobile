import api from "@/service/api.service";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Alert } from "react-native";

export interface EventType {
  _count: any;
  id: number;
  name: string;
  shortName: string;
  eventDate: string;
  eventType: number;
  isOpen: number; // 0 or 1
  createdById: number;
  feeScheme: {
    entryFee: number;
    maxBirdCount: number;
    raceFeeMode?: "PER_BIRD_PER_RACE" | "FLAT_PER_RACE";
    hotSpot1Fee?: number | null;
    hotSpot2Fee?: number | null;
    hotSpot3Fee?: number | null;
    hotSpotFinalFee?: number | null;
    perchFeeItems: any[];
    birdFeeItems?: { birdNo: number; birdFee: number }[];
    raceTypeFees?: { raceTypeId: number; fee: number }[];
  };
  races?: {
    id: number;
    description: string;
    startTime: string | null;
    isClosed: number; // 0 or 1
    raceTypeId?: number | null;
  }[];
}

interface Participant {
  id: number;
  breederName: string;
  loft: string;
  city: string;
  state: string;
  country: string;
  reservedBirds: number;
  signInDate: Date;
  birds: {
    id: number;
    birdNo: number;
    band: string;
    birdName: string;
    color: string;
    sex: number | null;
  }[];
}

interface EventInventoryItem {
  id: number;
  birdId: number;
  eventInventoryId: number;
  arrivalTime?: Date | null;
  departureDate?: Date | null;
  perchFeeValue?: number;
  perchFeePaid?: boolean;
  entryRefund?: boolean;
  betsRefund?: boolean;
  isBackup?: boolean;
  transferDue?: boolean;
  bird?: {
    id: number;
    birdName: string;
    rfid?: string;
    band: string;
    color?: string;
    sex?: number;
    note?: string;
    isActive: number;
    isLost?: number;
    lostDate?: Date | null;
  };
}

interface EventInventory {
  id: number;
  eventId: number;
  breederId: number;
  reservedBirds: number;
  loft: string;
  signInDate: Date;
  eventInventoryItems: EventInventoryItem[];
  breeder: {
    firstName: string;
    lastName: string;
    email: string;
  };
  event: {
    name: string;
    eventDate: Date;
  };
}

interface EventContextType {
  events: EventType[];
  currentEvent: EventType | null;
  participants: Participant[];
  loading: boolean;
  error: string | null;
  listEvents: (isOpen?: boolean) => Promise<{ events: EventType[]; totalCount: number }>;
  getEvent: (id: string) => Promise<EventType | null>;
  getEventParticipants: (eventId: string) => Promise<{ participants: Participant[]; totalParticipants: number }>;
  createEventInventory: (eventId: string, birds: any[], loft?: string) => Promise<any>;
  getMyEventInventories: () => Promise<EventInventory[]>;
}

const EventContext = createContext<EventContextType | undefined>(undefined);

export const EventProvider = ({ children }: { children: ReactNode }) => {
  const [events, setEvents] = useState<EventType[]>([]);
  const [currentEvent, setCurrentEvent] = useState<EventType | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listEvents();
  }, []);

  const listEvents = useCallback(
    async (isOpen?: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const params: any = {};
        if (isOpen !== undefined) params.isOpen = isOpen.toString();

        const response = await api.get("/breeder/events", { params });
        const events = response.data.events || [];
        const totalCount = response.data.count || events.length;

        setEvents(events);
        return { events, totalCount };
      } catch (err: any) {
        console.error("Error fetching events:", err);
        const errorMessage =
          err.response?.data?.message || err.message || "Failed to fetch events";
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const getEvent = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/breeder/events/${id}`);
      const event = response.data.event;
      if (!event) {
        throw new Error("Event not found");
      }
      setCurrentEvent(event);
      return event;
    } catch (err: any) {
      setError(err.message || "Failed to fetch event");
      Alert.alert("Error", "Failed to fetch event");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const getEventParticipants = useCallback(async (eventId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/breeder/event/${eventId}/inventory-items`);
      const items = response.data.eventInventoryItems || [];

      // Group by breeder into the Participant shape
      const breederMap = new Map<number, Participant>();
      for (const item of items) {
        const inv = item.eventInventory;
        const key = inv?.breederId;
        if (!key) continue;
        if (!breederMap.has(key)) {
          const firstName = inv.breeder?.firstName || "";
          const lastName = inv.breeder?.lastName || "";
          breederMap.set(key, {
            id: inv.id,
            breederName: `${firstName} ${lastName}`.trim() || "Unknown",
            loft: inv.loft || "N/A",
            city: inv.breeder?.city || "",
            state: inv.breeder?.state || "",
            country: inv.breeder?.country || "",
            reservedBirds: inv.reservedBirds || 0,
            signInDate: inv.signInDate,
            birds: [],
          });
        }
        const breeder = breederMap.get(key)!;
        if (item.bird) {
          breeder.birds.push({
            id: item.id,
            birdNo: breeder.birds.length + 1,
            band: item.bird.band || "",
            birdName: item.bird.birdName || "",
            color: item.bird.color || "",
            sex: item.bird.sex || null,
          });
        }
      }

      const participants = Array.from(breederMap.values());
      setParticipants(participants);
      return {
        participants,
        totalParticipants: participants.length,
      };
    } catch (err: any) {
      setError(err.message || "Failed to fetch event participants");
      Alert.alert("Error", "Failed to fetch event participants");
      return { participants: [], totalParticipants: 0 };
    } finally {
      setLoading(false);
    }
  }, []);

  const createEventInventory = useCallback(
    async (eventId: string, birds: any[], loft: string = "Main Loft") => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.post(`/breeder/event/${eventId}/register`, {
          loftName: loft,
          reservedBirds: birds.length,
          birds: birds.map((b: any) => ({
            name: b.birdName,
            color: b.color,
            sex: b.sex,
            band1: b.band1 || "",
            band2: b.band2 || "",
            band3: b.band3 || "",
            band4: b.band4 || "",
          })),
          payments: [],
        });
        return response.data;
      } catch (err: any) {
        setError(err.message || "Failed to create event inventory");
        Alert.alert("Error", err.response?.data?.message || "Failed to create event inventory");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const getMyEventInventories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get("/breeder/my-events");
      return response.data.inventories || [];
    } catch (err: any) {
      setError(err.message || "Failed to fetch your event inventories");
      Alert.alert("Error", "Failed to fetch your event inventories");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <EventContext.Provider
      value={{
        events,
        currentEvent,
        participants,
        loading,
        error,
        listEvents,
        getEvent,
        getEventParticipants,
        createEventInventory,
        getMyEventInventories,
      }}
    >
      {children}
    </EventContext.Provider>
  );
};

export const useEvents = (): EventContextType => {
  const context = useContext(EventContext);
  if (context === undefined) {
    throw new Error("useEvents must be used within an EventProvider");
  }
  return context;
};
