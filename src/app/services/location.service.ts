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
    this.socket = io('http://localhost:3000');

    // ✅ Correct — listens for server broadcast event 'location:updated'
    this.socket.on('location:updated', (data: LocationUpdate) => {
      this.locationSubject.next(data);
    });
  }

  getLocationUpdates(): Observable<LocationUpdate> {
    return this.locationSubject.asObservable();
  }
}