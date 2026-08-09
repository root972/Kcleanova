export interface LocationUpdate {
  workerId: number;
  lat: number;
  lng: number;
  latitude?: number;
  longitude?: number;
  distance?: number;
  timestamp?: string | Date;
}

export interface GeofenceAlert {
  workerId: number;
  distance: number;
  timestamp: string | Date;
}