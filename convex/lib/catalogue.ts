// Single source of truth: the approved BrightRoom catalogue (fictional teaching data).
// All prices are total euros. No taxes, fees, discounts or longer-duration prices exist.

export type VenueId = "V1" | "V2";
export type ServiceId = "S1" | "S2" | "S3" | "S4";

export interface Venue {
  id: VenueId;
  name: string;
  price: number;
  hours: number;
  maxPeople: number;
  wheelchairAccessible: boolean;
  conditions: string;
}

export interface Service {
  id: ServiceId;
  name: string;
  price: number;
  pricing: "per_person" | "flat";
  conditions: string;
}

export const VENUES: Venue[] = [
  { id: "V1", name: "Studio", price: 240, hours: 4, maxPeople: 12, wheelchairAccessible: false, conditions: "4 hours; max 12 people; stairs only; Wi-Fi included" },
  { id: "V2", name: "Loft", price: 420, hours: 4, maxPeople: 24, wheelchairAccessible: true, conditions: "4 hours; max 24 people; wheelchair accessible; Wi-Fi included" },
];

export const SERVICES: Service[] = [
  { id: "S1", name: "Coffee break", price: 8, pricing: "per_person", conditions: "One coffee break for every attendee" },
  { id: "S2", name: "Lunch", price: 18, pricing: "per_person", conditions: "One lunch for every attendee; vegetarian/vegan on request; no allergen guarantee" },
  { id: "S3", name: "Projector", price: 35, pricing: "flat", conditions: "One projector for the booking" },
  { id: "S4", name: "Facilitator", price: 280, pricing: "flat", conditions: "One facilitator for 2 hours" },
];

export const MAX_HOURS = 4;
export const MAX_PEOPLE = Math.max(...VENUES.map((v) => v.maxPeople));
export const FACILITATOR_HOURS = 2;

export const venueById = (id: VenueId) => VENUES.find((v) => v.id === id)!;
export const serviceById = (id: ServiceId) => SERVICES.find((s) => s.id === id)!;

export const eur = (n: number) => `€${n.toLocaleString("en-IE")}`;
