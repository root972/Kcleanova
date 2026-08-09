import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';

// 1. EXPORT LocationUpdate REQUIRED BY alerts-panel AND worker-map
export interface LocationUpdate {
  workerId: number;
  lat: number;
  lng: number;
  latitude?: number;
  longitude?: number;
  distance?: number;
  timestamp?: string | Date;
}

export interface GeofenceConfig {
  id?: number;
  siteLat: number;
  siteLng: number;
  radiusMeters: number;
  gracePeriodSeconds: number;
}

// 2. ALIAS WorkerLocation TO PREVENT BREAKING EXISTING CODE
export type WorkerLocation = LocationUpdate;

export interface GeofenceAlert {
  workerId: number;
  distance: number;
  timestamp: string | Date;
}

@Injectable({
  providedIn: 'root'
})
export class LocationService {
  private socket!: Socket;
  private locationSubject = new Subject<LocationUpdate>();
  private geofenceSubject = new Subject<GeofenceConfig>();
  private watchId: number | null = null;
  private readonly API_URL = 'http://localhost:3000/api/geofence';

  constructor(private http: HttpClient) {
    this.socket = io('http://localhost:3000', {
      transports: ['websocket', 'polling'],
      withCredentials: true
    });

    // Listens for real-time broadcasts from backend
    this.socket.on('location:updated', (data: LocationUpdate) => {
      this.locationSubject.next(data);
    });

    this.socket.on('geofence:updated', (config: GeofenceConfig) => {
      this.geofenceSubject.next(config);
    });
  }

  getLocationUpdates(): Observable<LocationUpdate> {
    return this.locationSubject.asObservable();
  }

  getGeofenceUpdates(): Observable<GeofenceConfig> {
    return this.geofenceSubject.asObservable();
  }

  fetchGeofenceConfig(): Observable<GeofenceConfig> {
    return this.http.get<GeofenceConfig>(this.API_URL);
  }

  startTracking(workerId: number): void {
    if (!('geolocation' in navigator)) {
      console.error('Geolocation is not supported by this browser.');
      return;
    }

    if (this.watchId !== null) return;

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const payload: LocationUpdate = {
          workerId: workerId,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: new Date().toISOString()
        };

        // Emit real-time location payload to Socket.io backend
        this.socket.emit('location:update', payload);
      },
      (error) => console.error('Geolocation error:', error.message),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000
      }
    );
  }

  stopTracking(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }
}