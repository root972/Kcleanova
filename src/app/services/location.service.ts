import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';

export interface LocationUpdate {
  workerId: number;
  latitude: number;
  longitude: number;
  timestamp: string;
}

@Injectable({
  providedIn: 'root'
})
export class LocationService {
  private socket!: Socket;
  private locationSubject = new Subject<LocationUpdate>();

  constructor() {
    // Connect to your Express Socket.io backend
    this.socket = io('http://localhost:3000');

    // Listen for live broadcast events from backend
    this.socket.on('location:updated', (data: LocationUpdate) => {
      this.locationSubject.next(data);
    });
  }

  // Returns an Observable stream that WorkerMap can subscribe to
  getLocationUpdates(): Observable<LocationUpdate> {
    return this.locationSubject.asObservable();
  }
}