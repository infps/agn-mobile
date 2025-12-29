// d:\agn-mobile\context\EventContext.tsx
import api from "@/service/api.service";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
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
  idEvent: number;
  eventName: string;
  eventShortName: string;
  eventDate: string;
  eventType: string;
  isOpen: boolean;
  creatorId: number;
  feeScheme: {
    entryFee: number;
    hotSpot1Fee?: number;
    hotSpot2Fee: number;
    hotSpot3Fee: number;
    hotSpotFinalFee: number;
    maxBirdCount: number;
    perchFeeItems: any[];
  };
  // Add other event properties as needed
}

interface Participant {
  idEventInventory: number;
  breederName: string;
  loft: string;
  city: string;
  state: string;
  country: string;
  reservedBirds: number;
  signInDate: Date;
  birds: {
    idEventInventoryItem: number;
    birdNo: number;
    band: string;
    birdName: string;
    color: string;
    sex: string | null;
  }[];
}

interface EventInventoryItem {
  idEventInventoryItem: number;
  idBird: number;
  idEventInventory: number;
  arrivalTime?: Date | null;
  departureDate?: Date | null;
  perchFeeValue?: number;
  entryFeeValue?: number;
  entryFeePaid?: boolean;
  entryRefund?: boolean;
  betsRefund?: boolean;
  hotSpotFeeValue?: number;
  hotSpotRefund?: boolean;
  isBackup?: boolean;
  transferDue?: boolean;
  // Belgian show bets
  belgianShowBet1?: number;
  belgianShowBet2?: number;
  belgianShowBet3?: number;
  belgianShowBet4?: number;
  belgianShowBet5?: number;
  belgianShowBet6?: number;
  belgianShowBet7?: number;
  // Standard show bets
  standardShowBet1?: number;
  standardShowBet2?: number;
  standardShowBet3?: number;
  standardShowBet4?: number;
  standardShowBet5?: number;
  standardShowBet6?: number;
  // WTA bets
  wtaBet1?: number;
  wtaBet2?: number;
  wtaBet3?: number;
  wtaBet4?: number;
  wtaBet5?: number;
  isBetActive?: boolean;
  bird?: {
    idBird: number;
    birdName: string;
    rfId?: string;
    band: string;
    color?: string;
    sex?: string;
    note?: string;
    isActive: boolean;
    isLost?: boolean;
    lostDate?: Date | null;
  };
}
interface EventInventory {
  idEventInventory: number;
  idEvent: number;
  idBreeder: number;
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
    eventName: string;
    eventDate: Date;
  };
}
// Add these to your EventContextType interface
interface EventContextType {
  events: EventType[];
  currentEvent: EventType | null;
  participants: Participant[];
  loading: boolean;
  error: string | null;
  createEvent: (
    eventData: Omit<Event, "idEvent" | "creatorId">
  ) => Promise<void>;
  updateEvent: (id: number, eventData: Partial<Event>) => Promise<void>;
  listEvents: (
    isOpen?: boolean,
    page?: number,
    limit?: number
  ) => Promise<{ events: Event[]; totalCount: number }>;
  listCreatorEvents: () => Promise<{ events: Event[]; totalCount: number }>;
  getEvent: (id: number) => Promise<Event | null>;
  getMoreEvents: (
    currentEventId: number,
    isOpen?: boolean,
    page?: number,
    limit?: number
  ) => Promise<{ events: Event[]; totalCount: number }>;
  getEventParticipants: (
    eventId: number
  ) => Promise<{ participants: Participant[]; totalParticipants: number }>;
  createEventInventory: (
    eventId: number,
    birds: number[],
    loft?: string
  ) => Promise<{ orderId: string }>;
  getMyEventInventories: () => Promise<EventInventory[]>;
  getEventInventory: (inventoryId: number) => Promise<EventInventory>;
  updateEventInventoryItem: (
    itemId: number,
    updates: Partial<EventInventoryItem>
  ) => Promise<EventInventoryItem>;
  listEventInventories: (
    eventId: number,
    query?: string
  ) => Promise<{ inventories: EventInventory[]; totalCount: number }>;
}
const EventContext = createContext<EventContextType | undefined>(undefined);

export const EventProvider = ({ children }: { children: ReactNode }) => {
  const [events, setEvents] = useState<EventType[]>([]);
  const [currentEvent, setCurrentEvent] = useState<EventType | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_URL = "YOUR_API_BASE_URL"; // Replace with your actual API base URL

  useEffect(() => {
    listEvents();
  }, []);
  const createEvent = useCallback(
    async (eventData: Omit<Event, "idEvent" | "creatorId">) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_URL}/api/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await SecureStore.getItemAsync("auth_token")}`,
          },
          body: JSON.stringify(eventData),
        });

        if (!response.ok) {
          throw new Error("Failed to create event");
        }

        const newEvent = await response.json();
        setEvents((prev) => [...prev, newEvent]);
        router.back();
      } catch (err: any) {
        setError(err.message || "Failed to create event");
        Alert.alert("Error", "Failed to create event");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const updateEvent = useCallback(
    async (id: number, eventData: Partial<Event>) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_URL}/api/events/${id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await SecureStore.getItemAsync("auth_token")}`,
          },
          body: JSON.stringify(eventData),
        });

        if (!response.ok) {
          throw new Error("Failed to update event");
        }

        const updatedEvent = await response.json();
        setEvents((prev) =>
          prev.map((event) =>
            event.idEvent === id ? { ...event, ...updatedEvent } : event
          )
        );
        if (currentEvent?.idEvent === id) {
          setCurrentEvent((prev) =>
            prev ? { ...prev, ...updatedEvent } : null
          );
        }
        router.back();
      } catch (err: any) {
        setError(err.message || "Failed to update event");
        Alert.alert("Error", "Failed to update event");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [currentEvent]
  );

  const listEvents = useCallback(
    async (isOpen?: boolean, page = 1, limit = 10) => {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({
          page: page.toString(),
          limit: limit.toString(),
          ...(isOpen !== undefined && { isOpen: isOpen.toString() }),
        }).toString();

        const response = await api.get(`https://api.infps-demo.com/api/events`);
        // The events are in response.data.data.events
        const events = response.data.data?.events || [];
        const totalCount = response.data.data?.totalCount || events.length;

        setEvents(events);
        return {
          events,
          totalCount,
        };
      } catch (err: any) {
        console.error("Error fetching events:", err);
        const errorMessage =
          err.response?.data?.message ||
          err.message ||
          "Failed to fetch events";
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const listCreatorEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/events/creator`, {
        headers: {
          Authorization: `Bearer ${await SecureStore.getItemAsync("auth_token")}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch creator events");
      }

      const data = await response.json();
      return data;
    } catch (err: any) {
      setError(err.message || "Failed to fetch creator events");
      Alert.alert("Error", "Failed to fetch creator events");
      return { events: [], totalCount: 0 };
    } finally {
      setLoading(false);
    }
  }, []);

  const getEvent = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(
        `https://api.infps-demo.com/api/events/${id}`
      );
      if (!response.data.data) {
        throw new Error("Event not found");
      }

      const event = response.data.data;
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

  const getMoreEvents = useCallback(
    async (currentEventId: number, isOpen?: boolean, page = 1, limit = 10) => {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({
          page: page.toString(),
          limit: limit.toString(),
          ...(isOpen !== undefined && { isOpen: isOpen.toString() }),
        }).toString();

        const response = await fetch(
          `${API_URL}/api/events/more/${currentEventId}?${query}`,
          {
            headers: {
              Authorization: `Bearer ${await SecureStore.getItemAsync("auth_token")}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("Failed to fetch more events");
        }

        return await response.json();
      } catch (err: any) {
        setError(err.message || "Failed to fetch more events");
        Alert.alert("Error", "Failed to fetch more events");
        return { events: [], totalCount: 0 };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const getEventParticipants = useCallback(async (eventId: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_URL}/api/events/${eventId}/participants`,
        {
          headers: {
            Authorization: `Bearer ${await SecureStore.getItemAsync("auth_token")}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch event participants");
      }

      const data = await response.json();
      setParticipants(data.participants);
      return data;
    } catch (err: any) {
      setError(err.message || "Failed to fetch event participants");
      Alert.alert("Error", "Failed to fetch event participants");
      return { participants: [], totalParticipants: 0 };
    } finally {
      setLoading(false);
    }
  }, []);
  const createEventInventory = useCallback(
    async (eventId: number, birds: number[], loft: string = "Main Loft") => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `${API_URL}/api/events/${eventId}/inventory`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${await SecureStore.getItemAsync("auth_token")}`,
            },
            body: JSON.stringify({
              birds,
              loft,
            }),
          }
        );
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.message || "Failed to create event inventory"
          );
        }
        return await response.json();
      } catch (err: any) {
        setError(err.message || "Failed to create event inventory");
        Alert.alert("Error", err.message || "Failed to create event inventory");
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
      const response = await fetch(`${API_URL}/api/events/my-inventories`, {
        headers: {
          Authorization: `Bearer ${await SecureStore.getItemAsync("auth_token")}`,
        },
      });
      if (!response.ok) {
        throw new Error("Failed to fetch your event inventories");
      }
      return await response.json();
    } catch (err: any) {
      setError(err.message || "Failed to fetch your event inventories");
      Alert.alert("Error", "Failed to fetch your event inventories");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);
  const getEventInventory = useCallback(async (inventoryId: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_URL}/api/event-inventories/${inventoryId}`,
        {
          headers: {
            Authorization: `Bearer ${await SecureStore.getItemAsync("auth_token")}`,
          },
        }
      );
      if (!response.ok) {
        throw new Error("Failed to fetch event inventory");
      }
      return await response.json();
    } catch (err: any) {
      setError(err.message || "Failed to fetch event inventory");
      Alert.alert("Error", "Failed to fetch event inventory");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);
  const updateEventInventoryItem = useCallback(
    async (itemId: number, updates: Partial<EventInventoryItem>) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `${API_URL}/api/event-inventory-items/${itemId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${await SecureStore.getItemAsync("auth_token")}`,
            },
            body: JSON.stringify(updates),
          }
        );
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.message || "Failed to update inventory item"
          );
        }
        return await response.json();
      } catch (err: any) {
        setError(err.message || "Failed to update inventory item");
        Alert.alert("Error", "Failed to update inventory item");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );
  const listEventInventories = useCallback(
    async (eventId: number, query: string = "") => {
      setLoading(true);
      setError(null);
      try {
        const url = new URL(`${API_URL}/api/events/${eventId}/inventories`);
        if (query) {
          url.searchParams.append("q", query);
        }
        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${await SecureStore.getItemAsync("auth_token")}`,
          },
        });
        if (!response.ok) {
          throw new Error("Failed to fetch event inventories");
        }
        return await response.json();
      } catch (err: any) {
        setError(err.message || "Failed to fetch event inventories");
        Alert.alert("Error", "Failed to fetch event inventories");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );
  return (
    <EventContext.Provider
      value={{
        events,
        currentEvent,
        participants,
        loading,
        error,
        createEvent,
        updateEvent,
        listEvents,
        listCreatorEvents,
        getEvent,
        getMoreEvents,
        getEventParticipants,
        createEventInventory,
        getMyEventInventories,
        getEventInventory,
        updateEventInventoryItem,
        listEventInventories,
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
